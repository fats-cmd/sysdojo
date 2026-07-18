// TypeScript 6 (TS2882) requires type declarations even for side-effect
// imports like `import '../global.css'` (processed by NativeWind, not tsc).
declare module '*.css';
