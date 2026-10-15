import { spawn } from "node:child_process";
import http from "node:http";

async function main() {
  const edgePath = "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
  const profileDir = "C:\\Users\\DELL\\.gemini\\antigravity\\brain\\eec50c3b-644f-446b-bc04-6b36bf3e7b04\\scratch\\edge-profile";
  
  const edge = spawn(edgePath, [
    "--headless=new",
    "--remote-debugging-port=9222",
    `--user-data-dir=${profileDir}`,
    "about:blank"
  ]);

  await new Promise(r => setTimeout(r, 1500));

  let versionData;
  for (let i = 0; i < 10; i++) {
    try {
      const res = await fetch("http://127.0.0.1:9222/json/version");
      versionData = await res.json();
      break;
    } catch {
      await new Promise(r => setTimeout(r, 500));
    }
  }

  if (!versionData) {
    console.error("Could not connect to Edge DevTools port 9222");
    edge.kill();
    return;
  }

  // Create a new tab
  const newTabRes = await fetch("http://127.0.0.1:9222/json/new?http://localhost:3000/admin/login", { method: "PUT" });
  const tabData = await newTabRes.json();
  const wsUrl = tabData.webSocketDebuggerUrl;

  const ws = new WebSocket(wsUrl);

  const errors = [];
  const logs = [];

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

  ws.onopen = async () => {
    await send("Runtime.enable");
    await send("Page.enable");
    await send("Log.enable");

    // Listen for console and exceptions
    ws.onmessage = (event) => {
      const msg = JSON.parse(event.data);
      if (msg.method === "Runtime.exceptionThrown") {
        errors.push("EXCEPTION: " + JSON.stringify(msg.params.exceptionDetails));
      } else if (msg.method === "Runtime.consoleAPICalled") {
        const text = msg.params.args.map(a => a.value || a.description || JSON.stringify(a)).join(" ");
        logs.push(`CONSOLE [${msg.params.type}]: ${text}`);
      } else if (msg.method === "Log.entryAdded") {
        logs.push(`LOG [${msg.params.entry.level}]: ${msg.params.entry.text}`);
      }
    };

    console.log("Navigating to http://localhost:3000/admin/login...");
    await send("Page.navigate", { url: "http://localhost:3000/admin/login" });

    await new Promise(r => setTimeout(r, 3000));

    // Try logging in as admin
    console.log("Attempting sign in via evaluation...");
    const loginResult = await send("Runtime.evaluate", {
      expression: `(async () => {
        const emailInput = document.querySelector('input[type="email"]') || document.querySelector('input[name="email"]');
        const pwdInput = document.querySelector('input[type="password"]');
        const submitBtn = document.querySelector('button[type="submit"]');
        if (emailInput && pwdInput && submitBtn) {
          emailInput.value = "admin@rapidshiftlabs.com";
          emailInput.dispatchEvent(new Event('input', { bubbles: true }));
          pwdInput.value = "admin123";
          pwdInput.dispatchEvent(new Event('input', { bubbles: true }));
          submitBtn.click();
          return "SUBMITTED";
        }
        return "NO_FORM";
      })()`,
      awaitPromise: true
    });
    console.log("Login evaluated:", JSON.stringify(loginResult));

    await new Promise(r => setTimeout(r, 3000));

    console.log("Navigating to http://localhost:3000/admin/clients...");
    await send("Page.navigate", { url: "http://localhost:3000/admin/clients" });
    await new Promise(r => setTimeout(r, 3000));

    // Evaluate click on Onboard Client
    console.log("Evaluating click on Onboard Client...");
    const clickResult = await send("Runtime.evaluate", {
      expression: `(() => {
        const btn = document.querySelector('[data-testid="new-client-btn"]');
        if (!btn) return "BUTTON_NOT_FOUND: " + document.body.innerText.slice(0, 300);
        btn.click();
        const modal = document.querySelector('[data-testid="create-client-name"]');
        return modal ? "MODAL_OPENED_SUCCESSFULLY" : "MODAL_DID_NOT_OPEN";
      })()`
    });
    console.log("Click result:", JSON.stringify(clickResult));

    // Now test navigating to client detail view
    const detailUrlRes = await send("Runtime.evaluate", {
      expression: `(() => {
        const link = document.querySelector('a[href^="/admin/clients/cli_"]');
        return link ? link.href : null;
      })()`
    });
    console.log("Detail URL found:", JSON.stringify(detailUrlRes));

    if (detailUrlRes?.result?.value) {
      console.log("Navigating to client detail view: " + detailUrlRes.result.value);
      await send("Page.navigate", { url: detailUrlRes.result.value });
      await new Promise(r => setTimeout(r, 3000));

      const tabClickResult = await send("Runtime.evaluate", {
        expression: `(() => {
          const tabs = Array.from(document.querySelectorAll('nav[aria-label="Client Tabs"] button'));
          if (tabs.length === 0) return "NO_TABS_FOUND";
          const firstTab = tabs[0]?.innerText;
          const secondTab = tabs[1];
          if (!secondTab) return "NO_SECOND_TAB";
          const secondText = secondTab.innerText;
          secondTab.click();
          return "CLICKED_TAB: " + secondText + " (prev: " + firstTab + ")";
        })()`
      });
      console.log("Tab click result:", JSON.stringify(tabClickResult));

      // Check if active tab switched
      const checkActive = await send("Runtime.evaluate", {
        expression: `(() => {
          const active = document.querySelector('nav[aria-label="Client Tabs"] button.border-blue-600');
          return active ? "ACTIVE_TAB: " + active.innerText : "NO_ACTIVE_TAB";
        })()`
      });
      console.log("Active tab after click:", JSON.stringify(checkActive));

      // Test Edit button
      const editClickResult = await send("Runtime.evaluate", {
        expression: `(() => {
          const editBtn = document.querySelector('[data-testid="client-edit-btn"]');
          if (!editBtn) return "EDIT_BTN_NOT_FOUND";
          editBtn.click();
          const modal = document.querySelector('input[value]');
          return modal ? "EDIT_MODAL_OPENED" : "EDIT_MODAL_DID_NOT_OPEN";
        })()`
      });
      console.log("Edit modal click result:", JSON.stringify(editClickResult));
    }

    console.log("\n=== BROWSER LOGS (" + logs.length + ") ===");
    logs.forEach(l => console.log(l));

    console.log("\n=== BROWSER ERRORS (" + errors.length + ") ===");
    errors.forEach(e => console.error(e));

    ws.close();
    edge.kill();
    process.exit(0);
  };
}

main().catch(console.error);
