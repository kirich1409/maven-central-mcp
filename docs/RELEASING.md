# Release Guide

Полная инструкция по релизу плагинов из этого монорепо. Краткая выжимка — в [`CLAUDE.md`](../CLAUDE.md) §Publishing.

## TL;DR

GitHub → **Actions** → **Release** → **Run workflow** → выбрать плагин + bump → **Run**. Готово.

## Когда нужен релиз

- Поправил баг в плагине → **patch**
- Добавил фичу/новый агент/новый skill → **minor**
- Сломал backward compatibility (переименовал агента, удалил skill, поменял схему) → **major**
- Только docs / CI / scripts / README — релиз не нужен, версии не бампятся

## Стандартный флоу

1. **Pre-release checklist** ([PLUGIN-STANDARDS.md §10](PLUGIN-STANDARDS.md)):
   - `bash scripts/validate.sh` локально → зелёный
   - `plugin-dev:plugin-validator` агент на бампящиеся плагины → PASS или только Minor
   - Все changes в main (или в feature-branch уже смержены)
2. **GitHub** → **Actions** → **Release** → **Run workflow**.
3. Inputs:
   - **plugin** — какой плагин релизим (dropdown из 6)
   - **bump** — `patch` / `minor` / `major`
   - **cascade** — оставить включённым (default `true`); только для `developer-workflow*` family имеет эффект
4. **Run workflow**.
5. ~1 минута → готово:
   - Новый коммит на `main`: `Release {plugin} {version}`
   - Per-plugin тег `{plugin-name}--v{version}` запушен
   - (Если `maven-mcp`) `@krozov/maven-central-mcp@{version}` опубликован на npm
   - GitHub Release создан, привязан к новому тегу

## Cascade — что это

Только для `developer-workflow*` family (4 плагина связаны через `dependencies` в `plugin.json`):

```
developer-workflow-experts   ← foundation
developer-workflow           ← depends on experts
developer-workflow-kotlin    ← depends on workflow + experts
developer-workflow-swift     ← depends on workflow + experts
```

При cascade=true:
- Бампим `developer-workflow-experts` minor → `workflow`/`kotlin`/`swift` получают **patch** bump + их `dependencies[experts].version` переписывается на новый `^MAJOR.MINOR.0`
- Бампим `developer-workflow` minor → `kotlin`/`swift` получают patch + range update
- Бампим `kotlin` или `swift` → ничего не каскадится (никто на них не зависит)

При cascade=false: бампится только выбранный плагин, ranges в зависимых остаются устаревшими (Claude Code продолжит резолвить старую версию по semver) — нужно только если знаешь что делаешь.

Для `maven-mcp` и `sensitive-guard` cascade флаг игнорируется (они вне family).

## Failure modes

### npm publish упал с 403 EPUBLISHCONFLICT
Версия уже на npm. Скорее всего — кто-то (или предыдущий запуск) уже опубликовал. Проверить:
```bash
npm view @krozov/maven-central-mcp versions
```
Если нужная версия там есть — release фактически прошёл, нужно вручную дотянуть только tag (см. ниже).

### Тег уже существует
Workflow упадёт на `git tag`. Если тег был создан случайно/тестово:
```bash
git push origin :refs/tags/{plugin-name}--v{version}
git tag -d {plugin-name}--v{version}
```
Затем перезапустить workflow.

### validate.sh fails в workflow
Что-то нарушено локально перед бампом. Запустить локально, посмотреть какой инвариант сломан:
```bash
bash scripts/validate.sh
```
Чаще всего — рассинхрон между `plugin.json` / `marketplace.json` / (для maven-mcp) `package.json`. Поправить руками, закоммитить, перезапустить workflow.

### Cascade неверно обновил dependencies
`scripts/release.mjs` пишет `^MAJOR.MINOR.0`. Если нужен другой range (`~`, exact pin) — поправить в плагине вручную PR'ом, потом релизить.

## Rollback

### npm пакет
```bash
npm unpublish @krozov/maven-central-mcp@{version} --force
```
Работает **только в течение 72 часов** после публикации. После — версию нельзя удалить, можно только deprecated:
```bash
npm deprecate @krozov/maven-central-mcp@{version} "Broken release, use {next-version}"
```

### Git tag
```bash
git push origin :refs/tags/{plugin-name}--v{version}
git tag -d {plugin-name}--v{version}
```

### GitHub Release
В UI — открыть Release, **Delete release**.

### Версия в коде
Открыть PR с revert commit'а `Release {plugin} {version}`:
```bash
git revert {sha}
git push origin HEAD:revert-release-{plugin}
gh pr create --title "Revert: Release {plugin} {version}" --body "..."
```
**Важно**: после revert версия в `plugin.json` опустится назад. Следующий релиз начнёт с прежней точки — закоммить дополнительный bump в revert PR'е, если нужно «прыгнуть» за пределы битой версии (например, `0.10.0 → плохой 0.10.1 → revert → release 0.10.2`).

### Cascade откат
Если cascade-bumped плагины тоже плохие — каждый откатывается отдельно по шагам выше. Не bulk-операция.

## Технические детали

- Workflow source: [`.github/workflows/release.yml`](../.github/workflows/release.yml)
- Bump script: [`scripts/release.mjs`](../scripts/release.mjs) — `node scripts/release.mjs` с env vars `PLUGIN`/`BUMP`/`CASCADE` для локального dry-run
- Validate: [`scripts/validate.sh`](../scripts/validate.sh) — per-plugin three-way invariant
- NPM credentials: GitHub secret `NPM_TOKEN`, scope `automation`
- Release Environment: `NPM Publishing` (required-reviewer гейт активен — настраивается в Settings → Environments)

## Известные ограничения

- Нельзя зарелизить два плагина одним кликом — запускай workflow дважды.
- Нет pre-release / rc / beta тегов — только stable.
- Нет автодетекта «какой плагин бампить из изменённых файлов» — выбираешь сам.
- Cascade — one-level (не транзитивный). Family shallow, этого достаточно.
