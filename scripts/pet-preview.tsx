import React, { useState } from "react";
import { createRoot } from "react-dom/client";
import { PetCompanion } from "../src/ui/PetCompanion";
import type { CompanionHost } from "../src/ui/types";
import type { Action } from "../src/shared/protocol";
const host = {
  pet: { load:()=>JSON.parse(localStorage.getItem("pet-preview")||"null"),save:(memory:unknown)=>localStorage.setItem("pet-preview",JSON.stringify(memory)) },
  petAsset:(file:string)=>`assets/pet/${file}`,
  petUrl:(state:string)=>`assets/pet/yellow_${state==="busy"?"run":state==="reading"?"walk":state==="success"?"with_ball":state==="error"?"swipe":"idle"}_8fps.gif`,
} as unknown as CompanionHost;
function Preview(){
  const [action,setAction]=useState<Action>("chat"),[running,setRunning]=useState(false),[quiet,setQuiet]=useState(false),[outcome,setOutcome]=useState<"idle"|"success"|"error">("idle");
  return <><main><small>HOTYAYA / 0.3.3</small><h1>留一点时间，<br/>给自己和小伙伴。</h1><p>它会陪你读书、写字，也陪你放空。<br/>点击右下角的爪印，打开你们的小窝。</p><article><h2>今天的小小计划</h2><p>读几页书，记下一个想法。<br/>不急着做完所有事，先把这一刻过好。</p></article><fieldset><legend>动作预览</legend><select aria-label="任务" value={action} onChange={e=>setAction(e.target.value as Action)}>{["chat","comment","explain","polish","translate","table","research","image","pptx","slides","html"].map(a=><option key={a}>{a}</option>)}</select><button onClick={()=>{setOutcome("idle");setRunning(!running);}}>{running?"停止工作":"开始工作"}</button><button onClick={()=>{setRunning(false);setOutcome("success");}}>完成</button><button onClick={()=>{setRunning(false);setOutcome("error");}}>失败</button><label><input type="checkbox" checked={quiet} onChange={e=>setQuiet(e.target.checked)}/>安静模式</label><button onClick={()=>document.body.classList.toggle("theme-dark")}>深色</button></fieldset></main><div className="mdc-root"><div className="mdc-shell"><PetCompanion host={host} running={running} action={action} reading={false} outcome={outcome} comment="今天也一起慢慢来。" quiet={quiet} onChat={()=>alert("这里会打开原有聊天窗口。预览页不调用模型。")} open={false}/></div></div></>;
}
createRoot(document.getElementById("root")!).render(<Preview/>);
