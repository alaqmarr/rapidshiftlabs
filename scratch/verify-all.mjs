import { spawn } from "node:child_process";

async function run() {
  const edgePath = "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
  const profileDir = "C:\\Users\\DELL\\.gemini\\antigravity\\brain\\eec50c3b-644f-446b-bc04-6b36bf3e7b04\\scratch\\edge-profile-test-2";
  
  const edge = spawn(edgePath, [
    "--headless=new",
    "--remote-debugging-port=9224",
    `--user-data-dir=${profileDir}`,
    "about:blank"
  ]);

  try {
    await new Promise(r => setTimeout(r, 2000));

    let versionData;
    for (let i = 0; i < 10; i++) {
      try {
        const res = await fetch("http://127.0.0.1:9224/json/version");
        versionData = await res.json();
        break;
      } catch {
        await new Promise(r => setTimeout(r, 500));
      }
    }

    if (!versionData) {
      console.error("Could not connect to Edge DevTools port 9224");
      return;
    }

    const newTabRes = await fetch("http://127.0.0.1:9224/json/new?about:blank", { method: "PUT" });
    const tabData = await newTabRes.json();
    const ws = new WebSocket(tabData.webSocketDebuggerUrl);

    const errors = [];
    let msgId = 1;

    function send(method, params = {}) {
      return new Promise((resolve) => {
        const id = msgId++;
        const handler = (event) => {
          const msg = JSON.parse(event.data);
          if (msg.id === id) {
            ws.removeEventListener("message", handler);
            resolve(msg.result);
          }
        };
        ws.addEventListener("message", handler);
        ws.send(JSON.stringify({ id, method, params }));
      });
    }

    await new Promise((resolve) => {
      ws.onopen = async () => {
        await send("Runtime.enable");
        await send("Page.enable");
        await send("Log.enable");

        ws.onmessage = (event) => {
          const msg = JSON.parse(event.data);
          if (msg.method === "Runtime.exceptionThrown") {
            const desc = msg.params.exceptionDetails?.exception?.description || JSON.stringify(msg.params.exceptionDetails);
            errors.push("EXCEPTION: " + desc);
          } else if (msg.method === "Runtime.consoleAPICalled" && msg.params.type === "error") {
            const text = msg.params.args.map(a => a.value || a.description || JSON.stringify(a)).join(" ");
            errors.push(`CONSOLE_ERROR: ${text}`);
          }
        };
        resolve();
      };
    });

    console.log("=== 1. Testing Admin Login & Control Panel Shell ===");
    await send("Page.navigate", { url: "http://localhost:3000/admin/login" });
    await new Promise(r => setTimeout(r, 2000));

    // Admin login with proper React input setter
    const loginRes = await send("Runtime.evaluate", {
      expression: `(async () => {
        const emailInput = document.querySelector('#admin-email');
        const pwdInput = document.querySelector('#admin-password');
        const submitBtn = document.querySelector('button[type="submit"]');
        if (emailInput && pwdInput && submitBtn) {
          const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
          nativeSetter.call(emailInput, "admin@rapidshiftlabs.com");
          emailInput.dispatchEvent(new Event('input', { bubbles: true }));
          emailInput.dispatchEvent(new Event('change', { bubbles: true }));

          nativeSetter.call(pwdInput, "Admin@RapidShift2026!");
          pwdInput.dispatchEvent(new Event('input', { bubbles: true }));
          pwdInput.dispatchEvent(new Event('change', { bubbles: true }));

          submitBtn.click();
          return "LOGIN_SUBMITTED";
        }
        return "NO_LOGIN_FORM";
      })()`,
      awaitPromise: true
    });
    console.log("Admin Login submit result:", loginRes?.result?.value);
    await new Promise(r => setTimeout(r, 3500));

    // Check Admin Shell elements
    const adminShellCheck = await send("Runtime.evaluate", {
      expression: `({
        url: window.location.href,
        hasHeader: !!document.querySelector('header'),
        hasNav: !!document.querySelector('nav'),
        hasFooter: !!document.querySelector('footer'),
        headerBrand: document.querySelector('header')?.innerText?.slice(0, 50)?.replace(/\\n/g, ' '),
        navCategories: Array.from(document.querySelectorAll('nav a')).map(a => a.innerText.trim()).filter(Boolean),
        footerText: document.querySelector('footer')?.innerText?.slice(0, 50)?.replace(/\\n/g, ' '),
      })`,
      returnByValue: true
    });
    console.log("Admin Shell Check:", JSON.stringify(adminShellCheck?.result?.value, null, 2));

    console.log("=== 2. Testing Admin Clients Page & Onboard Modal ===");
    await send("Page.navigate", { url: "http://localhost:3000/admin/clients" });
    await new Promise(r => setTimeout(r, 2000));

    const onboardModalRes = await send("Runtime.evaluate", {
      expression: `(() => {
        const btn = document.querySelector('[data-testid="new-client-btn"]');
        if (!btn) return { error: "No new-client-btn found", url: window.location.href };
        btn.click();
        const modal = document.querySelector('h3');
        return {
          buttonFound: true,
          modalHeading: modal?.innerText?.trim(),
          inputFound: !!document.querySelector('[data-testid="create-client-name"]')
        };
      })()`,
      returnByValue: true
    });
    console.log("Onboard Client Modal Test:", JSON.stringify(onboardModalRes?.result?.value, null, 2));

    console.log("=== 3. Testing Client Detail View Tabs & Edit Modal ===");
    const clientUrl = "http://localhost:3000/admin/clients/cli_01M4KF1YVKPEAR7WNBNV4RYB67";
    await send("Page.navigate", { url: clientUrl });
    await new Promise(r => setTimeout(r, 2500));

    // Check Shell on client detail page
    const clientDetailShell = await send("Runtime.evaluate", {
      expression: `({
        url: window.location.href,
        hasHeader: !!document.querySelector('header'),
        hasNav: !!document.querySelector('nav'),
        hasFooter: !!document.querySelector('footer'),
        clientName: document.querySelector('h1')?.innerText?.trim()
      })`,
      returnByValue: true
    });
    console.log("Client Detail Shell Check:", JSON.stringify(clientDetailShell?.result?.value, null, 2));

    // Test Tab Switching: Click "Organization Info"
    const tabSwitchRes = await send("Runtime.evaluate", {
      expression: `(() => {
        const nav = document.querySelector('nav[aria-label="Client Tabs"]');
        if (!nav) return { error: "No Client Tabs nav found" };
        const tabs = Array.from(nav.querySelectorAll('button'));
        const orgTab = tabs.find(t => t.innerText.includes("Organization"));
        if (!orgTab) return { error: "No Organization tab found", tabs: tabs.map(t => t.innerText) };
        orgTab.click();
        return { clickedOrgTab: true };
      })()`,
      returnByValue: true
    });
    console.log("Click Organization Tab:", JSON.stringify(tabSwitchRes?.result?.value));
    await new Promise(r => setTimeout(r, 600));

    // Verify Active Tab changed
    const tabActiveAfter = await send("Runtime.evaluate", {
      expression: `(() => {
        const activeTab = document.querySelector('nav[aria-label="Client Tabs"] button.border-blue-600');
        return {
          activeTab: activeTab?.innerText?.trim(),
          hasOrgContent: document.body.innerText.includes("Organization Details") || document.body.innerText.includes("Tax & Commercial")
        };
      })()`,
      returnByValue: true
    });
    console.log("Tab Active After Click:", JSON.stringify(tabActiveAfter?.result?.value, null, 2));

    // Test Tab Switching: Click "Contracts"
    const contractTabRes = await send("Runtime.evaluate", {
      expression: `(() => {
        const nav = document.querySelector('nav[aria-label="Client Tabs"]');
        const tabs = Array.from(nav.querySelectorAll('button'));
        const contractTab = tabs.find(t => t.innerText.includes("Contracts"));
        if (contractTab) contractTab.click();
        return { clickedContractTab: !!contractTab };
      })()`,
      returnByValue: true
    });
    console.log("Click Contracts Tab:", JSON.stringify(contractTabRes?.result?.value));
    await new Promise(r => setTimeout(r, 600));

    const contractActiveAfter = await send("Runtime.evaluate", {
      expression: `(() => {
        const activeTab = document.querySelector('nav[aria-label="Client Tabs"] button.border-blue-600');
        return {
          activeTab: activeTab?.innerText?.trim(),
        };
      })()`,
      returnByValue: true
    });
    console.log("Contracts Tab Active:", JSON.stringify(contractActiveAfter?.result?.value));

    // Test Edit Client Modal
    const editModalTest = await send("Runtime.evaluate", {
      expression: `(() => {
        const editBtn = document.querySelector('[data-testid="client-edit-btn"]');
        if (!editBtn) return { error: "No edit client button found" };
        editBtn.click();
        return {
          editBtnFound: true,
          modalVisible: document.body.innerText.includes("Edit Organization Profile"),
        };
      })()`,
      returnByValue: true
    });
    console.log("Edit Client Modal Click:", JSON.stringify(editModalTest?.result?.value, null, 2));
    await new Promise(r => setTimeout(r, 500));

    const modalFormCheck = await send("Runtime.evaluate", {
      expression: `(() => {
        const modalHeading = Array.from(document.querySelectorAll('h3')).find(h => h.innerText.includes("Edit Organization"));
        return {
          hasModalHeading: !!modalHeading,
          hasOrgNameInput: !!document.querySelector('input[value*="RADIANT"]') || !!document.querySelector('input[required]'),
        };
      })()`,
      returnByValue: true
    });
    console.log("Modal Form Visible:", JSON.stringify(modalFormCheck?.result?.value, null, 2));

    console.log("=== 4. Testing Client Portal Login & Shell ===");
    await send("Page.navigate", { url: "http://localhost:3000/portal/login" });
    await new Promise(r => setTimeout(r, 2000));

    const clientLoginRes = await send("Runtime.evaluate", {
      expression: `(async () => {
        const emailInput = document.querySelector('input[type="email"]') || document.querySelector('input[name="email"]');
        const pwdInput = document.querySelector('input[type="password"]');
        const submitBtn = document.querySelector('button[type="submit"]');
        if (emailInput && pwdInput && submitBtn) {
          const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
          nativeSetter.call(emailInput, "client@acme.com");
          emailInput.dispatchEvent(new Event('input', { bubbles: true }));
          emailInput.dispatchEvent(new Event('change', { bubbles: true }));

          nativeSetter.call(pwdInput, "Client@RapidShift2026!");
          pwdInput.dispatchEvent(new Event('input', { bubbles: true }));
          pwdInput.dispatchEvent(new Event('change', { bubbles: true }));

          submitBtn.click();
          return "CLIENT_LOGIN_SUBMITTED";
        }
        return "NO_CLIENT_LOGIN_FORM";
      })()`,
      awaitPromise: true
    });
    console.log("Client login submit result:", clientLoginRes?.result?.value);
    await new Promise(r => setTimeout(r, 3500));

    const portalShellCheck = await send("Runtime.evaluate", {
      expression: `({
        url: window.location.href,
        hasHeader: !!document.querySelector('header'),
        hasNav: !!document.querySelector('nav'),
        hasFooter: !!document.querySelector('footer'),
        headerBrand: document.querySelector('header')?.innerText?.slice(0, 50)?.replace(/\\n/g, ' '),
        navItems: Array.from(document.querySelectorAll('nav a')).map(a => a.innerText.trim()).filter(Boolean),
        footerText: document.querySelector('footer')?.innerText?.slice(0, 50)?.replace(/\\n/g, ' '),
      })`,
      returnByValue: true
    });
    console.log("Portal Shell Check:", JSON.stringify(portalShellCheck?.result?.value, null, 2));

    console.log("=== 5. Testing Portal Subpages (Billing, Infrastructure, Support) ===");
    for (const subpath of ["/portal/billing", "/portal/infrastructure", "/portal/support", "/portal/contracts"]) {
      await send("Page.navigate", { url: `http://localhost:3000${subpath}` });
      await new Promise(r => setTimeout(r, 1500));
      const subCheck = await send("Runtime.evaluate", {
        expression: `({
          url: window.location.href,
          hasHeader: !!document.querySelector('header'),
          hasNav: !!document.querySelector('nav'),
          hasFooter: !!document.querySelector('footer'),
          pageHeading: document.querySelector('h1')?.innerText?.trim()
        })`,
        returnByValue: true
      });
      console.log(`Portal ${subpath}:`, JSON.stringify(subCheck?.result?.value));
    }

    console.log("=== SUMMARY OF CONSOLE ERRORS & EXCEPTIONS ===");
    console.log("Total errors captured:", errors.length);
    if (errors.length > 0) {
      console.error(errors.slice(0, 10).join("\n"));
    } else {
      console.log("PERFECT: ZERO console errors or unhandled exceptions!");
    }

    ws.close();
  } finally {
    edge.kill();
  }
}

run().catch(console.error);
