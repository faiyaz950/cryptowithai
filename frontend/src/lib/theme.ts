/**
 * Dark / light theme. `<html data-theme>` hi source of truth hai — CSS usi
 * par chalti hai aur JS-wale rang (charts) bhi usi ko padhte hain.
 */
export type Theme = "dark" | "light";

export const THEME_STORAGE_KEY = "cm-theme";

/** Paint se pehle chalta hai (layout ke <head> mein) taaki flash na ho. */
export const THEME_INIT_SCRIPT = `try{var t=localStorage.getItem("${THEME_STORAGE_KEY}");document.documentElement.dataset.theme=t==="light"?"light":"dark"}catch(e){document.documentElement.dataset.theme="dark"}`;

export function getTheme(): Theme {
  if (typeof document === "undefined") return "dark";
  return document.documentElement.dataset.theme === "light" ? "light" : "dark";
}

export function setTheme(theme: Theme) {
  document.documentElement.dataset.theme = theme;
  try {
    localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch {}
}

/** `data-theme` badalte hi callback; unsubscribe function lautata hai. */
export function onThemeChange(cb: (theme: Theme) => void): () => void {
  const obs = new MutationObserver(() => cb(getTheme()));
  obs.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
  return () => obs.disconnect();
}
