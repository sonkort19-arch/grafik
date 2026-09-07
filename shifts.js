(function(global){
  "use strict";

  global.MAShifts={
    create(deps){
      if(!deps || typeof deps.getSettings!=="function") throw new Error("MA Shifts: getSettings dependency is required");
      if(typeof deps.monthIndexForYearMonth!=="function") throw new Error("MA Shifts: monthIndexForYearMonth dependency is required");
      if(typeof deps.getDaySchedule!=="function") throw new Error("MA Shifts: getDaySchedule dependency is required");

      function settings(){ return deps.getSettings()||{}; }

      function expectedForDate(dateStr,serviceName){
        try{
          const [y,m,d]=String(dateStr||"").split("-").map(Number);
          if(y<2020 || y>2100 || m<1 || m>12 || d<1 || d>31) return null;
          const idx=deps.monthIndexForYearMonth(y,m-1);
          const daySchedule=deps.getDaySchedule();
          if(typeof daySchedule!=="function") return null;
          const row=daySchedule(idx,d);
          const s=settings();
          const pair=serviceName===s.service1 ? row?.s1 : serviceName===s.service2 ? row?.s2 : null;
          return pair ? {manager:pair.manager,master:pair.master} : null;
        }catch(e){
          return null;
        }
      }

      function shiftMinutes(time){
        const [h,m]=String(time||"00:00").split(":").map(Number);
        return (Number.isFinite(h)?h:0)*60 + (Number.isFinite(m)?m:0);
      }

      function shiftStartForService(service){
        const s=settings();
        return service===s.service2 ? (s.novaShiftStart||"09:00") : (s.shiftStart||"08:00");
      }

      function shiftEndForService(service){
        const s=settings();
        return service===s.service2 ? (s.novaShiftEnd||"19:00") : (s.shiftEnd||"22:00");
      }

      function isValidShiftPin(pin){
        return /^\d{4}$/.test(String(pin||""));
      }

      return {
        expectedForDate,
        shiftMinutes,
        shiftStartForService,
        shiftEndForService,
        isValidShiftPin
      };
    }
  };
})(window);
