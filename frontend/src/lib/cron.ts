const DAY_NAMES_EN = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const DAY_NAMES_ES = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];
const MONTH_NAMES_EN = ["", "January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const MONTH_NAMES_ES = ["", "enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];

function _describeCronExpression(expr: string, locale: "en" | "es"): string | null {
  const fields = expr.trim().split(/\s+/);
  if (fields.length < 5 || fields.length > 6) return null;
  const [minute, hour, dom, month, dow] = fields.slice(-5);
  const dayNames = locale === "es" ? DAY_NAMES_ES : DAY_NAMES_EN;
  const monthNames = locale === "es" ? MONTH_NAMES_ES : MONTH_NAMES_EN;

  const parts: string[] = [];

  if (minute === "*" && hour === "*") {
    return locale === "es" ? "Cada minuto" : "Every minute";
  }

  if (minute.startsWith("*/")) {
    parts.push(locale === "es" ? `Cada ${minute.slice(2)} minutos` : `Every ${minute.slice(2)} minutes`);
    if (hour !== "*") parts.push(_describeHour(hour, locale));
    return parts.join(locale === "es" ? ", " : ", ");
  }

  if (hour.startsWith("*/")) {
    parts.push(locale === "es" ? `Cada ${hour.slice(2)} horas` : `Every ${hour.slice(2)} hours`);
  } else if (hour !== "*") {
    parts.push(_describeHour(hour, locale));
  }

  if (dom !== "*" && dow === "*") {
    parts.push(locale === "es" ? `el día ${dom} del mes` : `on day ${dom} of the month`);
  }

  if (dow !== "*") {
    if (dow === "1-5") {
      parts.push(locale === "es" ? "de lunes a viernes" : "on weekdays");
    } else if (dow === "0,6" || dow === "6,0" || dow === "0" || dow === "6") {
      parts.push(locale === "es" ? "en fin de semana" : "on weekends");
    } else {
      const days = dow.split(",").flatMap((d) => {
        if (d.includes("-")) {
          const [start, end] = d.split("-").map(Number);
          return Array.from({ length: end - start + 1 }, (_, i) => dayNames[(start + i) % 7]);
        }
        const n = Number(d);
        return Number.isFinite(n) ? [dayNames[n % 7]] : [];
      });
      if (days.length) {
        parts.push(locale === "es" ? `los ${days.join(", ")}` : `on ${days.join(", ")}`);
      }
    }
  }

  if (month !== "*") {
    const months = month.split(",").map((m) => monthNames[Number(m)] ?? m);
    parts.push(locale === "es" ? `en ${months.join(", ")}` : `in ${months.join(", ")}`);
  }

  return parts.length ? parts.join(locale === "es" ? " " : " ") : null;
}

function _describeHour(hour: string, locale: "en" | "es"): string {
  if (hour.includes(",")) {
    const hours = hour.split(",").map((h) => `${h.padStart(2, "0")}:00`);
    return locale === "es" ? `a las ${hours.join(", ")}` : `at ${hours.join(", ")}`;
  }
  const h = Number(hour);
  if (!Number.isFinite(h)) return locale === "es" ? `a las ${hour}` : `at ${hour}`;
  return locale === "es" ? `a las ${String(h).padStart(2, "0")}:00` : `at ${String(h).padStart(2, "0")}:00`;
}

export function describeCron(expr: string, locale: "en" | "es" = "en"): string {
  const described = _describeCronExpression(expr, locale);
  return described ?? expr;
}

export function isValidCron(expr: string): boolean {
  const fields = expr.trim().split(/\s+/);
  if (fields.length < 5 || fields.length > 6) return false;
  const cronField = /^[\d*,\-/]+$/;
  return fields.every((f) => cronField.test(f));
}
