# Adapter Resolution

This reference defines the adapter matching algorithm and the replacement-template builder used
during the Discovery and Conversion phases of the DataBinding-to-ViewBinding migration. It
specifies how the skill determines which `@BindingAdapter` method DataBinding's annotation
processor would pick for a given XML attribute and expression type, and how that resolved adapter
is translated into a host-Kotlin call.

---

## Adapter source taxonomy

Every `@BindingAdapter` candidate the skill encounters falls into one of five buckets. The bucket
determines resolution priority, cleanup options, and escalation behavior.

**Project-local.** A `@BindingAdapter` declared in source files of the module currently being
migrated. Highest resolution priority — a local adapter overrides any library adapter with the
same attribute string. Cleanup after migration is the module's own responsibility.

**Monorepo.** A `@BindingAdapter` declared in source files of another Gradle module within the
same build (but not in the module under migration). Transitively compiled into the module's
classpath. Cleanup requires coordination with the owning module.

**Binary library.** A `@BindingAdapter` shipped in a published artifact on the classpath
(`androidx.databinding:databinding-adapters`, AndroidX libraries that bundle adapters,
third-party MVVM or image-loading libraries). The skill pulls these at runtime via `ksrc` rather
than a static catalog — see the next section for mechanics. After `dataBinding = false`, these
adapters are no longer invoked by the DataBinding runtime; their callsites need replacement
regardless of whether the dependency itself stays.

**Implicit Android setter.** No `@BindingAdapter` is involved. DataBinding's fallback resolution
rule maps `app:foo` to `view_class.setFoo(expression_type)` when no adapter matches. Many
`android:*` attributes operate this way (`android:enabled` → `setEnabled`, `android:selected` →
`setSelected`). Replacement is a direct property assignment or setter call on the ViewBinding
field.

**Unresolved.** No match found in any of the four buckets above. Always escalates — the skill
does not guess.

---

## Runtime adapter discovery via ksrc

The skill does not maintain a static, baked-in catalog of `@BindingAdapter` methods from
`androidx.databinding:databinding-adapters` or any other library. A static catalog drifts: every
AGP bump can ship new or changed adapters, and a frozen catalog leads the skill to generate
incorrect replacements for the version actually in the project. Runtime discovery solves this by
reflecting what the project itself resolves.

At the start of the Discovery phase, before processing any screen, the skill runs these steps
once per migration session:

1. Read `libs.versions.toml` and/or the Gradle dependency tree for the module being migrated to
   determine the exact version of `androidx.databinding:databinding-adapters` and any other
   adapter-bearing artifacts (Material, AppCompat extensions, image-loading libraries with
   `@BindingAdapter` declarations).

2. For each artifact, invoke `ksrc <groupId>:<artifactId>:<version>` to pull the source jar from
   the local Gradle cache. Note that `databinding-adapters` is distributed via `google()` Maven
   (`https://dl.google.com/dl/android/maven2/`), not Maven Central — the Gradle cache must have
   been populated by a prior sync.

3. Grep the extracted sources for `@BindingAdapter`, `@InverseBindingAdapter`,
   `@BindingConversion`, and `@BindingMethods` annotations to build a
   `(attribute_strings, parameter_types) → method_fqn` index.

4. Write the index to `./swarm-report/<slug>-adapter-sources.md` so subsequent screens in the
   same session reuse it without re-invoking `ksrc`.

The same procedure applies to any other classpath library that declares `@BindingAdapter`. If the
user changes a dependency version mid-migration, the index can be regenerated on demand.

**Failure modes.**

If `ksrc` is unavailable or the Gradle cache is unpopulated, the skill surfaces: "Cannot build
adapter catalog — verify ksrc is installed and `databinding-adapters:<version>` is present in
the Gradle cache." It does not attempt to guess adapter behavior from heuristics. The user is
offered two options: wait until the cache is populated and retry, or stop the migration scope.

If the source jar is absent for a specific artifact version (rare for older builds not yet fully
indexed on Google Maven), the skill offers to temporarily lift the version to the nearest one
that ships sources, or to treat all unresolved adapters in the scope as `binary_only`. A
`binary_only` adapter means the skill can read the method signature from the annotation in
bytecode but cannot inspect the implementation — the conservative path is to escalate rather
than synthesize a replacement blind.

**Infrastructure failure vs. semantic failure.** The two failure categories must not be
conflated. A *semantic failure* means the adapter genuinely cannot be matched against project
sources, the monorepo, or the binary classpath — the result is `adapter_origin = unresolved`
and the row escalates per `escalation-patterns.md §Unresolved adapter or expression`.
An *infrastructure failure* means `ksrc` cannot reach the Gradle cache or the dependency has
not been downloaded yet — the adapter may be perfectly resolvable once the tooling is available.
Infrastructure failure modes: network unavailable, Gradle cache missing the dependency, source
jar absent, `ksrc` binary not installed. For infrastructure failures, do NOT mark affected
rows as `unresolved`; instead, surface the dependency coordinates (`groupId:artifactId:version`)
to the user, pause discovery for that origin, and ask the user to remediate (run a Gradle sync,
install missing source jars, etc.). After remediation, re-run adapter discovery for the affected
origin only. Infrastructure failures are not routed to `escalation-patterns.md
§Unresolved adapter or expression`.

---

## Matching algorithm

The input for each XML attribute with a binding expression is a triple:

- `view_class` — the concrete Android class of the view element, resolved from the XML tag and
  its namespace, with the full class hierarchy available.
- `attribute_set` — all binding-expression attributes on that view element, needed for
  multi-attribute adapters.
- `expression_type` — the Kotlin/Java type the binding expression evaluates to, resolved per
  `expression-resolution.md` before this algorithm runs. If `expression_type` is still
  `unknown_type` when the search begins, force-escalate without further search.

The search proceeds in priority order. The first match terminates the search.

1. **Project-local `@BindingAdapter`.** Query `ast-index` for `@BindingAdapter` annotations in
   the current module's source set. A candidate matches when its declared attribute string equals
   the XML attribute name and the first (view) parameter type is assignable from `view_class`.

2. **Monorepo transitive.** If no project-local match, delegate an `Explore` agent (haiku) to
   search the rest of the build for `@BindingAdapter` whose attribute string matches. The Explore
   agent uses `ast-index` across all modules.

3. **Binary library.** If no monorepo match, consult the runtime-discovered index from
   `./swarm-report/<slug>-adapter-sources.md`. This covers `databinding-adapters` and any other
   adapter-bearing artifact indexed during Discovery startup.

4. **Implicit setter.** If no `@BindingAdapter` match exists anywhere, apply DataBinding's
   fallback: check whether `view_class` (or any superclass) exposes a setter
   `set<AttrLocalName>(<ExpressionType>)`. For platform widgets, a compact table of known setters
   covers the common cases (`TextView.setText`, `View.setBackground`, `View.setEnabled`,
   `ImageView.setImageDrawable`, etc.). For custom view classes, query `ast-index` on the view
   class hierarchy. Also resolve `@BindingMethods` declarations, which rename the effective
   setter (`@BindingMethod(type = View.class, attribute = "android:onClick", method =
   "setOnClickListener")`) — these enter the candidate list as low-priority setter aliases.

5. **Unresolved.** No match found — emit `unresolved` for this binding and escalate. Record any
   partial matches in the property map notes.

**Match criteria.** A candidate passes when:

- Its `attribute_set` is a subset of the view's binding attributes. With `requireAll = true`,
  this must be an exact subset; with `requireAll = false`, a non-empty intersection is
  sufficient.
- Its first parameter type is assignable from `view_class`, respecting the class hierarchy. An
  adapter declared on `View` matches `TextView`, but an adapter on `EditText` does not match
  plain `TextView`.
- Its value parameter type is compatible with `expression_type`, either by exact assignment or
  through a `@BindingConversion` chain.

**Tie-breaking.** When multiple candidates survive: a more specific view-class type wins over a
supertype, and an exact parameter-type match wins over a supertype match. If specificity is equal
after both rules, the result is ambiguous — escalate and record all candidates in the property
map notes.

---

## Overload selection and @BindingConversion

A single attribute string can be served by multiple `@BindingAdapter` methods with different
value-parameter types. DataBinding picks the overload at compile time; the skill replicates this
selection.

Selection order:

1. Exact type match between `expression_type` and the value parameter of one overload wins
   immediately.

2. If no exact match, search the global `@BindingConversion` pool — all
   `@BindingConversion`-annotated methods visible on the classpath — for a chain of one or two
   conversions that bridges `expression_type` to a candidate adapter's parameter type.
   `@BindingConversion` rules are classpath-wide; a conversion in any reachable source or binary
   is eligible.

3. If multiple candidates survive after applying conversions, apply the same view-class and
   parameter specificity tie-breaking as in the matching algorithm above.

4. If specificity is still equal across multiple candidates — or if `expression_type` is
   compatible with several overloads via different `@BindingConversion` chains — the result is
   ambiguous. Escalate with all viable paths listed in the property map notes.

**Worked example.** Suppose `app:imageUrl` is declared by two adapters:
`loadImage(view: View, url: String)` and `loadImage(view: View, uri: Uri)`. The `expression_type`
for `@{viewModel.avatar}` is `Uri`. Step 1 finds an exact match with the `Uri` overload; the
`String` overload is not a candidate. The replacement template uses the `Uri` overload. Had the
expression type been `String`, the `String` overload would win and produce a different template.

**Semantic differences between overloads.** Overloads for the same attribute can differ in
runtime behavior, not just parameter type. For `android:visibility`: the `Boolean` overload maps
`true → VISIBLE` and `false → GONE`, never producing `INVISIBLE`. The `Int` overload passes the
value directly, allowing all three states. The replacement template must reflect the chosen
overload: a `Boolean` expression becomes `binding.view.isVisible = expr` (using `core-ktx` if
available; otherwise `if (expr) View.VISIBLE else View.GONE`); an `Int` expression becomes
`binding.view.visibility = expr`.

**Special-case annotations.** `@BindingMethods` entries are setter aliases, not adapters — they
enter the candidate list at step 4 as low-priority implicit setters. `@InverseBindingAdapter` is
the two-way counterpart and is only considered when the expression uses `@={}`; for one-way
bindings it is ignored. Two-way bindings always escalate — see `escalation-patterns.md`.

---

## Replacement-template builder

Once an adapter is resolved and an overload selected, the skill constructs a host-Kotlin call
fragment for each property map entry.

**Implicit setter or `@BindingMethods` alias.** Use Kotlin property syntax where a conventional
equivalent exists: `setText` → `binding.<id>.text = expr`, `setEnabled` →
`binding.<id>.isEnabled = expr`, `setSelected` → `binding.<id>.isSelected = expr`. For setters
without a Kotlin property equivalent, use the method call form: `binding.<id>.setImageDrawable(expr)`.

**`@BindingAdapter` — static Java method (most common in `databinding-adapters`).** Call the
method directly: `TextViewBindingAdapter.setError(binding.<id>, expr)`. The first parameter is
the view; remaining parameters come from the binding expression and any `@BindingConversion`
output.

**`@BindingAdapter` — Kotlin top-level or object method.** Call by its unqualified name with
import, or fully qualified: `loadImage(binding.<id>, expr)`.

**`@BindingAdapter` — Kotlin companion or extension function.** Companion:
`ClassName.method(binding.<id>, expr)`. Extension: `binding.<id>.loadImage(expr)`.

**Multi-attribute adapter with `requireAll = false`.** DataBinding passes `null` for parameters
whose corresponding attribute is absent. The replacement must replicate this: collect all
binding-expression attributes on the view that belong to the adapter's declared attribute set,
pass resolved values for present attributes and `null` for absent ones. If any of those
expressions depends on mutable state, the binding is non-mechanical — escalate.

**Placement options by source bucket.**

- Project-local: call the method directly; no import issue.
- Monorepo: call across the module boundary if the owning module is already a declared dependency
  of the migrated module; otherwise escalate — adding a cross-module dependency is a structural
  decision outside the skill's scope.
- Binary library: call directly with import; verify the dependency does not silently disappear
  after `dataBinding = false`. AGP pulls `databinding-adapters` transitively when DataBinding is
  enabled; after the flag is off it must be declared explicitly if still used.
- Implicit setter: direct property or method call on the ViewBinding field.
- Unresolved: escalate — no template is generated.

Two-way bindings (`@={…}`) require both `@BindingAdapter` and `@InverseBindingAdapter` and are
not handled by this builder — they always route to `escalation-patterns.md`.

---

## Output of this phase

For each resolved binding, the skill writes one entry to `./swarm-report/<slug>-property-map.md`
(format specified in `property-map-spec.md`). Each entry records:

- Resolved adapter origin: `project-local`, `monorepo:<module-path>`,
  `binary:<group>:<artifact>:<version>`, `implicit-setter`, or `unresolved`.
- Resolved adapter symbol: fully qualified method name, or `<ViewClass>.set<Attr>` for implicit
  setters.
- Selected overload: parameter signature (e.g., `(TextView, CharSequence)`).
- Replacement template: the host-Kotlin snippet, ready to be woven into the host file by
  `mechanical-transforms.md`.
- Notes: escalation reason (if applicable), ambiguous candidates (if any), `@BindingConversion`
  chain applied (if any).

---

## Cross-references

- `expression-resolution.md` — how `expression_type` and `expression_fragment` are determined
  for each `@{…}` expression before this algorithm runs; `expression_fragment` is the input to
  the replacement-template builder, which wraps it into the final `replacement_fragment` call.
- `property-map-spec.md` — exact format of the output written to `<slug>-property-map.md`.
- `mechanical-transforms.md` — how the replacement template fragment is woven into the host
  Kotlin file during the Conversion phase.
- `escalation-patterns.md` — the full matrix of adapter origins versus cleanup options, two-way
  binding escalation details, and `binary_only` library handling.
