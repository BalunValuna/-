/**
 * Single save slot in localStorage (with a backup of the previous save).
 */
const KEY = 'tlr2_save';

export class SaveStore {
  peek() {
    try {
      const d = JSON.parse(localStorage.getItem(KEY) || 'null');
      return d && d.v === 2 ? d : null;
    } catch {
      return null;
    }
  }

  write(data) {
    try {
      const prev = localStorage.getItem(KEY);
      if (prev) localStorage.setItem(`${KEY}_prev`, prev);
      localStorage.setItem(KEY, JSON.stringify(data));
      return true;
    } catch {
      return false;
    }
  }

  clear() {
    localStorage.removeItem(KEY);
  }
}
