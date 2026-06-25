import { createFileRoute } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";
import { Calculator, Clock3, Delete, RotateCcw, Trash2 } from "lucide-react";

export const Route = createFileRoute("/_authenticated/calculator")({
  component: CalculatorPage,
});

type CalcHistory = {
  expression: string;
  result: string;
};

type Operator = "+" | "-" | "*" | "/";

const operatorLabels: Record<Operator, string> = {
  "+": "+",
  "-": "-",
  "*": "x",
  "/": "/",
};

const numberButtons = ["7", "8", "9", "4", "5", "6", "1", "2", "3", "0", ".", "="];
const operators: Operator[] = ["/", "*", "-", "+"];

function CalculatorPage() {
  const [display, setDisplay] = useState("0");
  const [expression, setExpression] = useState("");
  const [justSolved, setJustSolved] = useState(false);
  const [memory, setMemory] = useState(0);
  const [history, setHistory] = useState<CalcHistory[]>([]);
  const [shiftStart, setShiftStart] = useState("09:00");
  const [shiftEnd, setShiftEnd] = useState("17:00");
  const [breakMinutes, setBreakMinutes] = useState("30");
  const [hourlyRate, setHourlyRate] = useState("28");

  useEffect(() => {
    const saved = window.localStorage.getItem("rotaro-calculator-history");
    if (saved) {
      try {
        setHistory(JSON.parse(saved).slice(0, 8));
      } catch {
        setHistory([]);
      }
    }
  }, []);

  useEffect(() => {
    window.localStorage.setItem("rotaro-calculator-history", JSON.stringify(history.slice(0, 8)));
  }, [history]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const key = event.key;
      if (/^[0-9.]$/.test(key)) {
        event.preventDefault();
        pressNumber(key);
      } else if (["+", "-", "*", "/"].includes(key)) {
        event.preventDefault();
        pressOperator(key as Operator);
      } else if (key === "Enter" || key === "=") {
        event.preventDefault();
        solve();
      } else if (key === "Backspace") {
        event.preventDefault();
        backspace();
      } else if (key === "Escape") {
        event.preventDefault();
        clearAll();
      } else if (key === "%") {
        event.preventDefault();
        percent();
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  });

  const currentValue = Number(display);

  const shiftSummary = useMemo(() => {
    const minutes = getShiftMinutes(shiftStart, shiftEnd) - Number(breakMinutes || 0);
    const safeMinutes = Math.max(0, minutes);
    const hours = safeMinutes / 60;
    const pay = hours * Number(hourlyRate || 0);
    return {
      hours,
      pay,
      label: `${formatHours(hours)} hrs`,
      payLabel: money(pay),
    };
  }, [breakMinutes, hourlyRate, shiftEnd, shiftStart]);

  function pressNumber(value: string) {
    setDisplay((previous) => {
      if (justSolved) {
        setExpression("");
        setJustSolved(false);
        return value === "." ? "0." : value;
      }
      if (value === "." && previous.includes(".")) return previous;
      if (previous === "0" && value !== ".") return value;
      return `${previous}${value}`;
    });
  }

  function pressOperator(operator: Operator) {
    setExpression((previous) => {
      setJustSolved(false);
      const next = `${previous} ${display} ${operator}`.trim();
      return next.replace(/\s[+\-*/]\s-?$/, ` ${operator}`);
    });
    setDisplay("0");
  }

  function solve() {
    const fullExpression = `${expression} ${display}`.trim();
    const result = evaluateExpression(fullExpression);
    if (result == null) {
      setDisplay("Error");
      setExpression("");
      setJustSolved(true);
      return;
    }

    const formatted = formatNumber(result);
    setHistory((items) =>
      [{ expression: prettyExpression(fullExpression), result: formatted }, ...items].slice(0, 8),
    );
    setDisplay(formatted);
    setExpression("");
    setJustSolved(true);
  }

  function clearAll() {
    setDisplay("0");
    setExpression("");
    setJustSolved(false);
  }

  function clearEntry() {
    setDisplay("0");
  }

  function backspace() {
    setDisplay((previous) => {
      if (justSolved || previous === "Error" || previous.length <= 1) return "0";
      if (previous.length === 2 && previous.startsWith("-")) return "0";
      return previous.slice(0, -1);
    });
    setJustSolved(false);
  }

  function toggleSign() {
    setDisplay((previous) => {
      if (previous === "0" || previous === "Error") return previous;
      return previous.startsWith("-") ? previous.slice(1) : `-${previous}`;
    });
  }

  function percent() {
    if (display === "Error") return;
    setDisplay(formatNumber(Number(display) / 100));
  }

  function memoryAdd() {
    if (Number.isFinite(currentValue)) setMemory((value) => value + currentValue);
  }

  function memorySubtract() {
    if (Number.isFinite(currentValue)) setMemory((value) => value - currentValue);
  }

  function memoryStore() {
    if (Number.isFinite(currentValue)) setMemory(currentValue);
  }

  function memoryRecall() {
    setDisplay(formatNumber(memory));
    setJustSolved(false);
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="space-y-2">
          <h1 className="text-3xl font-bold tracking-tight text-[var(--navy)]">Calculator</h1>
          <p className="text-sm text-muted-foreground">
            Run quick calculations, use memory, and estimate shift hours without leaving Rotaro.
          </p>
        </div>
        <div className="rounded-xl border bg-card p-4 shadow-sm lg:min-w-[260px]">
          <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
            <Calculator className="size-4 text-[var(--navy)]" />
            Memory
          </div>
          <div className="mt-2 text-2xl font-bold text-[var(--navy)]">{formatNumber(memory)}</div>
          <div className="text-sm text-muted-foreground">Keyboard shortcuts are enabled.</div>
        </div>
      </header>

      <section className="grid gap-5 xl:grid-cols-[minmax(320px,480px)_1fr]">
        <div className="rounded-xl border bg-card shadow-sm">
          <div className="border-b p-4">
            <div className="min-h-6 break-all text-right text-sm text-muted-foreground">
              {expression ? prettyExpression(expression) : "Ready"}
            </div>
            <div className="mt-2 break-all text-right text-4xl font-bold tracking-tight text-[var(--navy)]">
              {display}
            </div>
          </div>

          <div className="grid grid-cols-4 gap-2 p-4">
            <CalcButton label="MC" onClick={() => setMemory(0)} muted />
            <CalcButton label="MR" onClick={memoryRecall} muted />
            <CalcButton label="M+" onClick={memoryAdd} muted />
            <CalcButton label="M-" onClick={memorySubtract} muted />
            <CalcButton label="MS" onClick={memoryStore} muted />
            <CalcButton label="CE" onClick={clearEntry} muted />
            <CalcButton
              label="C"
              onClick={clearAll}
              muted
              icon={<RotateCcw className="size-4" />}
            />
            <CalcButton label="%" onClick={percent} muted />

            <CalcButton label="+/-" onClick={toggleSign} muted />
            <CalcButton
              label="DEL"
              onClick={backspace}
              muted
              icon={<Delete className="size-4" />}
            />
            {operators.slice(0, 2).map((operator) => (
              <CalcButton
                key={operator}
                label={operatorLabels[operator]}
                onClick={() => pressOperator(operator)}
                accent
              />
            ))}

            {numberButtons.slice(0, 3).map((number) => (
              <CalcButton key={number} label={number} onClick={() => pressNumber(number)} />
            ))}
            <CalcButton label={operatorLabels["-"]} onClick={() => pressOperator("-")} accent />

            {numberButtons.slice(3, 6).map((number) => (
              <CalcButton key={number} label={number} onClick={() => pressNumber(number)} />
            ))}
            <CalcButton label={operatorLabels["+"]} onClick={() => pressOperator("+")} accent />

            {numberButtons.slice(6, 9).map((number) => (
              <CalcButton key={number} label={number} onClick={() => pressNumber(number)} />
            ))}
            <CalcButton label="=" onClick={solve} primary />

            {numberButtons.slice(9, 11).map((number) => (
              <CalcButton key={number} label={number} onClick={() => pressNumber(number)} />
            ))}
            <CalcButton label="00" onClick={() => pressNumber("0")} />
            <CalcButton
              label="Clear"
              onClick={clearAll}
              muted
              icon={<Trash2 className="size-4" />}
            />
          </div>
        </div>

        <div className="grid gap-5 lg:grid-cols-2 xl:grid-cols-1">
          <section className="rounded-xl border bg-card shadow-sm">
            <div className="border-b p-5">
              <div className="flex items-center gap-2">
                <Clock3 className="size-5 text-[var(--navy)]" />
                <h2 className="text-lg font-semibold text-[var(--navy)]">Shift hours helper</h2>
              </div>
              <p className="mt-1 text-sm text-muted-foreground">
                Calculate payable hours and estimated wage for one shift.
              </p>
            </div>
            <div className="grid gap-4 p-5 sm:grid-cols-2">
              <Field label="Start time" value={shiftStart} onChange={setShiftStart} type="time" />
              <Field label="End time" value={shiftEnd} onChange={setShiftEnd} type="time" />
              <Field
                label="Break minutes"
                value={breakMinutes}
                onChange={setBreakMinutes}
                type="number"
                min="0"
              />
              <Field
                label="Hourly rate"
                value={hourlyRate}
                onChange={setHourlyRate}
                type="number"
                min="0"
              />
              <div className="rounded-lg border bg-secondary/30 p-4">
                <div className="text-sm text-muted-foreground">Paid hours</div>
                <div className="mt-1 text-2xl font-bold text-[var(--navy)]">
                  {shiftSummary.label}
                </div>
              </div>
              <div className="rounded-lg border bg-secondary/30 p-4">
                <div className="text-sm text-muted-foreground">Estimated pay</div>
                <div className="mt-1 text-2xl font-bold text-[var(--navy)]">
                  {shiftSummary.payLabel}
                </div>
              </div>
            </div>
          </section>

          <section className="rounded-xl border bg-card shadow-sm">
            <div className="flex items-center justify-between gap-3 border-b p-5">
              <div>
                <h2 className="text-lg font-semibold text-[var(--navy)]">History</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  Your latest calculator results.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setHistory([])}
                className="inline-flex items-center gap-2 rounded-md border px-3 py-2 text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground"
              >
                <Trash2 className="size-4" />
                Clear
              </button>
            </div>
            <div className="max-h-[380px] overflow-auto p-3">
              {history.length === 0 ? (
                <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
                  No calculations yet.
                </div>
              ) : (
                <div className="space-y-2">
                  {history.map((item, index) => (
                    <button
                      key={`${item.expression}-${index}`}
                      type="button"
                      onClick={() => {
                        setDisplay(item.result);
                        setExpression("");
                        setJustSolved(true);
                      }}
                      className="w-full rounded-lg border bg-background p-3 text-left hover:bg-muted"
                    >
                      <div className="break-all text-sm text-muted-foreground">
                        {item.expression}
                      </div>
                      <div className="mt-1 break-all text-lg font-semibold text-[var(--navy)]">
                        {item.result}
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </section>
        </div>
      </section>
    </div>
  );
}

function CalcButton({
  label,
  onClick,
  icon,
  muted = false,
  accent = false,
  primary = false,
}: {
  label: string;
  onClick: () => void;
  icon?: ReactNode;
  muted?: boolean;
  accent?: boolean;
  primary?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex h-12 min-w-0 items-center justify-center gap-2 rounded-lg border text-sm font-semibold shadow-sm transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--navy)] ${
        primary
          ? "bg-[var(--navy)] text-white hover:bg-[var(--navy)]/90"
          : accent
            ? "bg-secondary text-[var(--navy)] hover:bg-secondary/70"
            : muted
              ? "bg-muted/70 text-muted-foreground hover:bg-muted hover:text-foreground"
              : "bg-background text-[var(--navy)] hover:bg-muted"
      }`}
    >
      {icon}
      <span>{label}</span>
    </button>
  );
}

function Field({
  label,
  value,
  onChange,
  type,
  min,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type: "time" | "number";
  min?: string;
}) {
  return (
    <label className="space-y-2">
      <span className="text-sm font-medium text-[var(--navy)]">{label}</span>
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        type={type}
        min={min}
        className="h-11 w-full rounded-md border bg-background px-3 text-sm outline-none focus:border-[var(--navy)] focus:ring-2 focus:ring-[var(--navy)]/15"
      />
    </label>
  );
}

function evaluateExpression(expression: string) {
  const tokens = expression.trim().split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return 0;

  const values: number[] = [];
  const ops: Operator[] = [];

  for (const token of tokens) {
    if (isOperator(token)) {
      while (ops.length && precedence(ops[ops.length - 1]) >= precedence(token)) {
        if (!applyTop(values, ops)) return null;
      }
      ops.push(token);
    } else {
      const value = Number(token);
      if (!Number.isFinite(value)) return null;
      values.push(value);
    }
  }

  while (ops.length) {
    if (!applyTop(values, ops)) return null;
  }

  return values.length === 1 && Number.isFinite(values[0]) ? values[0] : null;
}

function applyTop(values: number[], ops: Operator[]) {
  const operator = ops.pop();
  const right = values.pop();
  const left = values.pop();
  if (!operator || right == null || left == null) return false;

  if (operator === "+") values.push(left + right);
  if (operator === "-") values.push(left - right);
  if (operator === "*") values.push(left * right);
  if (operator === "/") {
    if (right === 0) return false;
    values.push(left / right);
  }
  return true;
}

function isOperator(token: string): token is Operator {
  return token === "+" || token === "-" || token === "*" || token === "/";
}

function precedence(operator: Operator) {
  return operator === "+" || operator === "-" ? 1 : 2;
}

function prettyExpression(expression: string) {
  return expression
    .replaceAll(" * ", " x ")
    .replaceAll(" / ", " / ")
    .replaceAll(" + ", " + ")
    .replaceAll(" - ", " - ");
}

function formatNumber(value: number) {
  if (!Number.isFinite(value)) return "Error";
  const rounded = Math.round(value * 1_000_000_000) / 1_000_000_000;
  return String(rounded);
}

function getShiftMinutes(start: string, end: string) {
  const [startHour, startMinute] = start.split(":").map(Number);
  const [endHour, endMinute] = end.split(":").map(Number);
  const startTotal = startHour * 60 + startMinute;
  let endTotal = endHour * 60 + endMinute;
  if (endTotal < startTotal) endTotal += 24 * 60;
  return endTotal - startTotal;
}

function formatHours(value: number) {
  return value.toLocaleString("en-US", {
    minimumFractionDigits: value % 1 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  });
}

function money(value: number) {
  return value.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  });
}
