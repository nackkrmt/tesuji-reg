// Remembers that this browser was used to enter the judge console, so
// re-opening the app (closing/reopening the browser) goes straight back to
// /judge/<token> instead of the home page. Cleared by "ออกจากโหมดกรรมการ".
const JUDGE_MODE_KEY = "tesuji.judgeMode";

export function isJudgeMode(): boolean {
  if (typeof window === "undefined") return false;
  return window.localStorage.getItem(JUDGE_MODE_KEY) === "1";
}

export function setJudgeMode(v: boolean) {
  if (typeof window === "undefined") return;
  if (v) window.localStorage.setItem(JUDGE_MODE_KEY, "1");
  else window.localStorage.removeItem(JUDGE_MODE_KEY);
}
