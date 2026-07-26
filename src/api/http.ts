import { MOCK } from '../config';
import { mockFetch } from '../mock/fixtures';

export async function getJSON<T>(url: string): Promise<T> {
  if (MOCK) {
    const mocked = mockFetch(url);
    if (mocked !== undefined) return mocked as T;
  }
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} for ${url}`);
  return res.json() as Promise<T>;
}
