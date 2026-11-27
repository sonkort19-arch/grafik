window.MARepairCalculator = {
  create({context, employees, load}) {
    const byId = id => document.getElementById(id);
    const accessPanel = byId("repairAccess"), content = byId("repairContent");
    const form = byId("repairUnlock"), pin = byId("repairPin"), selector = byId("repairEmployee");
    const status = byId("repairStatus"), retry = byId("repairRetry");
    let identity = null, epoch = 0, active = false, loading = false, frame = null;

    function mount(html) {
      if (typeof html !== "string" || !html.includes("</body>")) throw new Error("Не удалось открыть калькулятор");
      frame = document.createElement("iframe");
      frame.title = "Стоимость ремонта";
      frame.setAttribute("sandbox", "allow-scripts");
      // A sandboxed frame keeps the standalone calculator apart from the app's session.
      const layout = '<style>header{display:none}main{padding:12px 8px}.intro{margin-top:0}</style>';
      const size = '<script>new ResizeObserver(()=>parent.postMessage({type:"ma-repair-height",height:Math.ceil(document.body.getBoundingClientRect().height)},"*")).observe(document.body);<\/script>';
      frame.srcdoc = html.replace("</head>",layout+"</head>").replace("</body>",size+"</body>");
      content.replaceChildren(frame);
      accessPanel.classList.add("hidden");
    }

    window.addEventListener("message", event => {
      if (!frame || event.source !== frame.contentWindow || event.data?.type !== "ma-repair-height") return;
      const h = event.data.height;
      if (Number.isFinite(h) && h > 0) frame.style.height = Math.ceil(h) + "px";
    });

    async function open() {
      if (!active || loading || frame) return;
      const access = context(), employee = access.id || selector.value;
      if (access.kind === "employee" && (!employee || !form.reportValidity())) return;
      const current = epoch;
      loading = true;
      retry.classList.add("hidden");
      form.querySelector("button").disabled = true;
      status.textContent = "Открываем калькулятор…";
      try {
        const html = await load(access, employee, pin.value);
        if (current === epoch && active) mount(html);
      } catch (error) {
        if (current !== epoch) return;
        status.textContent = error.message || "Не удалось загрузить калькулятор.";
        retry.classList.toggle("hidden", access.kind === "employee");
      } finally {
        if (current === epoch) {
          loading = false;
          pin.value = "";
          form.querySelector("button").disabled = false;
        }
      }
    }

    function sync(visible) {
      const access = context(), key = access.kind + ":" + (access.id || "");
      const changed = key !== identity;
      if (changed || (!visible && active && access.kind === "employee" && !access.id)) {
        identity = key;
        frame = null;
        content.replaceChildren();
        accessPanel.classList.remove("hidden");
      }
      if (!changed && visible === active) return;
      epoch++;
      active = visible;
      loading = false;
      pin.value = "";
      form.querySelector("button").disabled = false;
      if (!active || frame) return;
      const personal = access.kind === "employee";
      form.classList.toggle("hidden", !personal);
      retry.classList.add("hidden");
      if (personal) {
        const choose = !access.id;
        byId("repairEmployeeField").classList.toggle("hidden", !choose);
        if (choose) selector.replaceChildren(new Option("Выберите сотрудника",""), ...employees().map(n => new Option(n,n)));
        status.textContent = choose ? "Выберите своё имя и введите личный PIN." : access.id + ", введите личный PIN.";
      } else {
        open();
      }
    }

    form.addEventListener("submit", event => { event.preventDefault(); open(); });
    retry.addEventListener("click", open);
    return {sync};
  }
};
