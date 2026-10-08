// This game intentionally omits Node typings. Tests only need this narrow API
// to retain the measured table alongside the test run evidence.
declare module 'node:fs' {
 export function writeFileSync(path: URL, data: string): void;
}
