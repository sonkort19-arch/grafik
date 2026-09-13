const fs=require('fs');
function read(p){return fs.readFileSync(p,'utf8');}
function must(ok,msg){if(!ok){console.error('FAIL:',msg);process.exitCode=1;}else console.log('OK:',msg);}

const controller=read('crm-order-controller.js');
const phase=read('crm-phase1.js');
const compact=read('crm-compact-order-v2.js');
const issue=read('crm-issue.js');
const mobile=read('crm-mobile-audit.js');
const picker=read('crm-item-picker.js');

must(controller.includes('ma:order:ready'),'controller exposes order-ready lifecycle');
must(controller.includes('readyToken'),'controller guards duplicate ready events');
must(!phase.includes('MutationObserver'),'order detail phase has no DOM observer');
must(phase.includes('ma:order:ready'),'order detail phase is lifecycle-driven');
must(phase.includes('ma-crm-item-cost-api'),'service cost is first-class in item writes');
must(!compact.includes('MutationObserver'),'compact order UI has no DOM observer');
must(compact.includes('ma:order:phase-ready'),'compact UI waits for detail phase event');
must(issue.includes('MAOrderController'),'issue flow reads controller snapshot');
must(!issue.includes('window.location.reload'),'issue flow does not reload the whole CRM');
must(!mobile.includes('crm-order-stability.js'),'obsolete stability observer is not loaded');
must(!mobile.includes('crm-service-cost.js'),'obsolete service-cost observer is not loaded');
must(mobile.includes('crm-order-controller.js'),'new controller is loaded');
must(!picker.includes('prefers-color-scheme:dark'),'item picker follows CRM light theme');

if(process.exitCode)process.exit(process.exitCode);
console.log('CRM order v2 structural tests passed');
