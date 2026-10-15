/**
 * RapidShift Embeds Loader (embed.js)
 * Shadow DOM Style-Isolated Custom Elements Runtime
 */
(function(){
  if(typeof window==="undefined"||typeof customElements==="undefined")return;
  var WIDGETS=[
    "due-banner","billing-summary","next-due-countdown","invoice-list","invoice-detail","payment-history",
    "contract-card","server-status","process-list","process-card","metrics-chart","uptime-badge",
    "domain-status","ssl-expiry","ticket-widget","ticket-thread","analytics-overview","analytics-chart",
    "top-pages","web-vitals","releases-list","status-page","client-dashboard"
  ];

  var RslWidgetElement=(function(_super){
    function RslWidget(name){
      var self=Reflect.construct(_super,[],RslWidget);
      self.widgetName=name||"client-dashboard";
      self.shadow=self.attachShadow({mode:"open"});
      return self;
    }
    Object.setPrototypeOf(RslWidget.prototype,_super.prototype);
    Object.setPrototypeOf(RslWidget,_super);

    RslWidget.prototype.connectedCallback=function(){this.render();};
    RslWidget.prototype.attributeChangedCallback=function(){this.render();};
    RslWidget.prototype.render=function(){
      var token=this.getAttribute("token")||this.getAttribute("data-token")||"";
      var clientId=this.getAttribute("client-id")||this.getAttribute("data-client-id")||"";
      var theme=this.getAttribute("theme")||"dark";
      var accent=this.getAttribute("accent")||"#6366f1";
      var endpoint=this.getAttribute("endpoint")||window.RSL_EMBED_ENDPOINT||window.location.origin;

      var isDark=theme==="dark";
      var bg=isDark?"#09090b":"#ffffff";
      var text=isDark?"#f4f4f5":"#09090b";
      var border=isDark?"#27272a":"#e4e4e7";

      var src=endpoint+"/embed/"+this.widgetName+"?token="+encodeURIComponent(token)+"&clientId="+encodeURIComponent(clientId)+"&theme="+encodeURIComponent(theme)+"&accent="+encodeURIComponent(accent);

      this.shadow.innerHTML="<style>:host{display:block;width:100%;font-family:system-ui,-apple-system,sans-serif;color-scheme:"+theme+";}.rsl-card{background:"+bg+";color:"+text+";border:1px solid "+border+";border-radius:12px;overflow:hidden;box-shadow:0 4px 6px -1px rgba(0,0,0,0.1);width:100%;min-height:160px;position:relative;}iframe{width:100%;height:100%;min-height:240px;border:none;display:block;}</style><div class=\"rsl-card\"><iframe src=\""+src+"\" title=\"RapidShift "+this.widgetName+"\" loading=\"lazy\" sandbox=\"allow-scripts allow-same-origin allow-forms allow-popups allow-downloads\"></iframe></div>";
    };
    return RslWidget;
  })(HTMLElement);

  for(var i=0;i<WIDGETS.length;i++){
    (function(w){
      var tag="rsl-"+w;
      if(!customElements.get(tag)){
        var Elem=function(){return Reflect.construct(RslWidgetElement,[w],Elem);};
        Object.setPrototypeOf(Elem.prototype,RslWidgetElement.prototype);
        Object.setPrototypeOf(Elem,RslWidgetElement);
        customElements.define(tag,Elem);
      }
    })(WIDGETS[i]);
  }
})();
