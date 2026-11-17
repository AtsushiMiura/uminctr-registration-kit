// Use the extension action itself (activeTab gesture). Repeated clicks open
// the panel without toggling it closed and discarding the in-memory draft.
void chrome.sidePanel.setPanelBehavior({openPanelOnActionClick:false});
chrome.action.onClicked.addListener(tab=>{
  if(tab.id!==undefined)void chrome.sidePanel.open({tabId:tab.id}).catch(()=>{});
});
export {};
