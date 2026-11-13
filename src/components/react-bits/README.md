# React Bits library

All React Bits components (TypeScript + Tailwind), kept as published so they can be updated from upstream.
License: MIT + Commons Clause (see LICENSE.md).

The app uses three of them: `Backgrounds/DotGrid`, `TextAnimations/ShinyText` and `Micro/StatusMark` (through
`src/components/brand-fx.tsx`). Their dependencies (`motion`, `react`) are installed.

The other components need libraries the app does not install, to keep installs light. Before you use one, install
what its imports name, for example:

```bash
npm install gsap @gsap/react ogl three @react-three/fiber @react-three/drei matter-js @use-gesture/react @hugeicons/react @hugeicons/core-free-icons vgpu
npm install -D @types/three @types/matter-js
```

This folder is excluded from type checking (tsconfig.json) and linting (eslint.config.mjs); a component the app imports
is still type-checked through that import.
