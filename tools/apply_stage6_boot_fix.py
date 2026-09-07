from pathlib import Path

p=Path('app.js')
text=p.read_text(encoding='utf-8')
old='''  function legacyPairPhase(s,date,role,group){
    const days=legacyDaysFromAnchor(s,date);
    const blockDays=Math.max(1,Number(s.serviceBlockDays)||14);
    const block=Math.floor(days/blockDays);
    const baseOffset=group===1?2:0;

    if(role==="master"){
      const partnerCycle=mod(Math.floor(block/2),2);
      const masterFlip=partnerCycle?2:0;
      return mod(days+baseOffset+masterFlip,4);
    }

    return mod(days+baseOffset,4);
  }
'''
new='''  function legacyPairPhase(s,date,role,group){
    const days=legacyDaysFromAnchor(s,date);
    const blockDays=Math.max(1,Number(s.serviceBlockDays)||14);
    const block=Math.floor(days/blockDays);
    const baseOffset=group===1?2:0;
    const positiveModulo=(value,size)=>((value%size)+size)%size;

    if(role==="master"){
      const partnerCycle=positiveModulo(Math.floor(block/2),2);
      const masterFlip=partnerCycle?2:0;
      return positiveModulo(days+baseOffset+masterFlip,4);
    }

    return positiveModulo(days+baseOffset,4);
  }
'''
count=text.count(old)
if count!=1:
    raise SystemExit(f'legacyPairPhase target count={count}')
p.write_text(text.replace(old,new,1),encoding='utf-8')
print('Stage 6 fresh-device boot fix applied')
