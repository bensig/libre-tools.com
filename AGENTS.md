# Repository Guidelines

## Project Structure & Module Organization
The app is a Vite-powered React SPA. Runtime entry lives in `src/main.jsx`, while `src/App.jsx` wires route-level tools such as the explorer, BTC tracker, and loan views. Feature screens (for example `LibreExplorer.jsx`, `TransactionDownloader.jsx`) live beside shared UI in `src/components`, helpers in `src/utils`, and assets in `src/assets`. Static HTML, favicons, and Netlify redirects stay in `public/`; production builds land in `dist/` and should never be committed. Update `params.json` whenever chain endpoints or tool metadata changes so all modules read a single source of truth.

## Build, Test, and Development Commands
Use Node 18+ and install dependencies with `npm install`. Start the local server with:
```
npm run dev
```
This serves the UI at `http://localhost:5173` with hot module replacement. Package a production bundle via `npm run build`, preview the optimized build locally with `npm run preview`, and lint JSX and JS with `npm run lint`.

## Coding Style & Naming Conventions
Follow the ESLint ruleset defined in `eslint.config.js`, which extends the React recommended presets. Components and hooks use PascalCase filenames (e.g., `LoanTracker.jsx`, `useTotals.js`), utility modules use camelCase, and CSS modules mirror their component names. Indent with two spaces, keep semicolons, favor functional components, and colocate styles in the matching `.css` file. Run `npm run lint` before opening a PR and resolve all warnings.

## Testing Guidelines
An automated test suite is not yet established; validate features through targeted manual flows (e.g., explorer pagination, BTC peg history downloads). When contributing new functionality, include lightweight smoke tests using your preferred React testing library under `src/__tests__/` and document setup steps in the PR. Guard against regressions by capturing screenshots or screen recordings for UI changes.

## Commit & Pull Request Guidelines
Commits in this repo use short imperative summaries (`Fix loan collateral pagination`, `Optimize vault lookup`). Craft commits that isolate logical changes and keep messages under 72 characters. Pull requests should describe the problem, the solution, and manual verification steps, link to any relevant issues, and attach before/after visuals for UI adjustments. Request review from a maintainer and ensure CI or lint checks are green before merging.
