# Expression Resolution

This reference defines the supported DataBinding expression grammar (the content inside
`@{...}` and `@={...}` attributes) and the identifier-resolution algorithm used during
Discovery. It produces two fields consumed by downstream references: `expression_type` —
the Kotlin type of the expression's result — and `expression_fragment` — the literal Kotlin
snippet representing the expression's value (e.g. `viewModel.user.name` or
`if (a) b else c`). `adapter-resolution.md` uses `expression_type` to select the correct
`@BindingAdapter` overload and consumes `expression_fragment` as input to its
replacement-template builder; `property-map-spec.md` records both fields in the property map.

---

## Mini-grammar of `@{...}` and `@={...}`

Bucket labels per production: **MECHANICAL** (deterministic conversion), **PARTIAL**
(converted with an explicit caveat the user must approve), **ESCALATE** (skill stops the
screen, human or agent decides per `escalation-patterns.md`).

```
expression      = one_way | two_way
one_way         = "@{" (expr | expr "," "default=" default_value) "}"
two_way         = "@={" expr "}"              ; ESCALATE — always, no exceptions

expr            = null_coalescing
null_coalescing = ternary ["??" ternary]      ; MECHANICAL -> Kotlin ?:
ternary         = logic ["?" expr ":" expr]   ; MECHANICAL (depth <= 2) -> if/else
                                              ; ESCALATE at depth > 2 — see §Escalation
logic           = comparison (("&&" | "||") comparison)*   ; MECHANICAL
comparison      = arithmetic (rel_op arithmetic)*           ; MECHANICAL
arithmetic      = unary (arith_op unary)*     ; MECHANICAL — Integer null semantics below
unary           = ("!" | "-") unary | atom
atom            = string_template | resource_ref | static_ref
                | safe_unbox | method_call | property_chain | literal | "(" expr ")"

property_chain  = identifier ("." identifier)*   ; MECHANICAL -> same chain in Kotlin
                  ; PARTIAL if any segment is nullable: may need smart-cast at host site

method_call     = property_chain "(" [arg_list] ")"
                  ; MECHANICAL if overload resolves unambiguously
                  ; ESCALATE on overload ambiguity or unresolvable receiver

lambda          = "(" [param_list] ")" "->" expr
                  ; MECHANICAL for 0-arg and 1-arg lambdas matching the SAM interface
                  ; PARTIAL for multi-arg lambdas — verify SAM type at call site

string_template = backtick_template | string_concat_expr
                  ; MECHANICAL -> Kotlin string template "Hello, ${name}"

backtick_template ::= '`' { STRING_CHAR | '${' expression '}' } '`'
                  ; DataBinding string literal using back-tick delimiters; resolves to String

string_concat_expr = expr "+" expr            ; both operands have type String (or one is
                  ; a String and the other is coerced) — MECHANICAL -> Kotlin "${a}${b}"
                  ; or "a" + b.toString(); DataBinding "+" is overloaded for numeric add
                  ; and string concatenation; keep the operand types to distinguish

resource_ref    = "@{" "@" res_type "/" res_name "}"   ; MECHANICAL (table below)
static_ref      = identifier "." identifier             ; resolved via <import>
                  ; MECHANICAL if <import> resolves via ast-index; ESCALATE otherwise

safe_unbox      = "safeUnbox(" expr ")"
                  ; MECHANICAL -> expr ?: zero_for_primitive
                  ; Int -> 0, Long -> 0L, Boolean -> false, Float -> 0f, Double -> 0.0

default_value   = expr                        ; the fallback expression after "default="
                  ; MECHANICAL -> expr ?: <resolved default>
```

**Resource-type mapping** (`context` = View context at host call site):

| DataBinding             | Kotlin                                                 |
|-------------------------|--------------------------------------------------------|
| `@string/foo`           | `context.getString(R.string.foo)`                      |
| `@dimen/padding`        | `context.resources.getDimensionPixelSize(R.dimen.padding)` for Int px receivers (most common — padding, sizes); `context.resources.getDimension(R.dimen.padding)` for Float px receivers (e.g. `setTextSize`); adapter resolution picks per the target setter's parameter type |
| `@color/primary`        | `ContextCompat.getColor(context, R.color.primary)`     |
| `@drawable/ic_x`        | `ContextCompat.getDrawable(context, R.drawable.ic_x)`  |
| `@integer/n`            | `context.resources.getInteger(R.integer.n)`            |
| `@bool/flag`            | `context.resources.getBoolean(R.bool.flag)`            |

The mechanical-transforms phase resolves the exact `context` source from the host class
type (Activity, Fragment, or adapter) discovered in Discovery step 4.

---

## Identifier resolution algorithm

For each raw `@{...}` content string the algorithm produces:
`{expression_class, resolved_symbol, expression_type, expression_fragment}`.

**Step 1 — Parse.** Match against the grammar above. On failure, record
`expression_class = unresolvable_grammar` and escalate. Do not attempt partial resolution.

**Step 2 — Walk identifiers.** Resolve each identifier left-to-right through this order:

1. **Layout `<variable>` declarations** — `<variable name="user" type="com.example.User"/>`
   introduces `user` with the declared FQN type. Read all `<variable>` elements from the
   layout's `<data>` block before resolving any expression in that layout.

2. **Layout `<import>` declarations** — `<import type="android.view.View"/>` makes `View`
   available as a short name; `<import type="com.foo.Bar" alias="B"/>` makes `B` available.
   These back `static_ref` resolutions (`View.VISIBLE`, `B.CONSTANT`).

3. **Project-local symbols via ast-index** — for identifiers not covered above, run
   `ast-index symbol "<name>"` or `ast-index class "<name>"`. Covers top-level functions,
   companion object members, and enum constants referenced without an import alias. If
   ast-index reports "Index not found", this is an infrastructure failure (index not
   initialized), not a semantic failure — do not escalate the row; instead prompt the user
   to initialize ast-index, then retry. Only escalate when ast-index is initialized and
   returns no result for an actual symbol.

4. **Binary library symbols via ksrc** — when an `<import>` names a class from a binary
   dependency (e.g., `<import type="androidx.core.view.ViewCompat"/>`), resolve the class
   signature via `ksrc`. Required for `static_ref` when the class is not in project sources.

5. **`@={...}` two-way context** — always escalates; record the token and defer to
   `escalation-patterns.md`.

**Step 3 — Attach types.** For each resolved identifier attach its Kotlin type:
- `<variable>` declaration: the declared type verbatim.
- Property chain: walk via `ast-index symbol` return type; propagate nullability.
- Method call: return type of the resolved overload; binary receivers via `ksrc`.
- Resource ref: platform type from the mapping table (`String`, `Float`, `Drawable`, etc.).
- `safeUnbox(x)`: the primitive (non-nullable) counterpart of `x`'s type.
- Arithmetic / logic / comparison: standard Kotlin type rules. Note: DataBinding silently
  treats `null Integer` as zero in arithmetic; the replacement must add `?: 0` to preserve
  this behavior.

**Step 4 — Compute `expression_type`.** The leaf type after full tree typing:
- `a ?? b`: Kotlin LUB of the non-null type of `a` and the type of `b`. If the types have
  no common supertype (e.g., `Uri` and `Drawable`), escalate with both types recorded.
- `c ? a : b`: Kotlin LUB of the types of `a` and `b`.
- `default_value`: the non-null type of the primary expression.
- `lambda`: the functional interface type the attribute expects, resolved via
  `@BindingMethods` mapping or the SAM interface of the setter parameter.
- Everything else: the type of the outermost evaluated node.

If any type is unresolvable, record `expression_type = unresolved` and escalate.

**Step 5 — Produce `expression_fragment`.** Translate the typed parse tree to Kotlin:

| Input                                | Kotlin fragment                                        |
|--------------------------------------|--------------------------------------------------------|
| `viewModel.user.name`                | `viewModel.user.name`                                  |
| `handler.formatPrice(item.price)`    | `handler.formatPrice(item.price)`                      |
| `condition ? a : b`                  | `if (condition) a else b`                              |
| `a ?? b`                             | `a ?: b`                                               |
| `a ?? @string/fallback`              | `a ?: context.getString(R.string.fallback)`            |
| `safeUnbox(viewModel.count)`         | `viewModel.count ?: 0`                                 |
| `@{@string/foo}`                     | `context.getString(R.string.foo)`                      |
| `user.name, default=@string/default` | `user.name ?: context.getString(R.string.default)`     |
| `"Hello, " + name`                   | `"Hello, $name"`                                       |
| `(v) -> viewModel.onClick(item)`     | `{ v -> viewModel.onClick(item) }` (SAM context)       |
| `View.VISIBLE`                       | `View.VISIBLE` (import preserved)                      |
| `a + b`, `a > b`, `a && b`          | direct Kotlin equivalent                               |

---

## Escalation rules

Record `bucket = escalate` in the property map; do not emit an expression fragment:

- **Two-way `@={...}`** — any expression in a two-way binding. See `escalation-patterns.md`
  for `@InverseBindingAdapter` handling.
- **Unresolved identifier** — fails all five steps in §Step 2. Record the failing token.
- **Overload ambiguity** — multiple method overloads survive type checking with no
  specificity winner. List all candidates in the property map note.
- **Generic type inference failure** — unbound type parameter `<T>` that cannot be pinned
  from the parse tree.
- **Null-coalescing type mismatch** — `a ?? b` where `a` and `b` have no common Kotlin
  supertype. DataBinding may accept this via `@BindingConversion`; record both types and
  defer to the adapter-resolution conversion check.
- **BR.* references** — any `BR.<field>` in the expression signals two-way or observable
  binding wiring with no direct ViewBinding analog. See `escalation-patterns.md`.
- **Nested ternary depth > 2** — more than two `?` operators in the same unparenthesized
  chain. Rationale: three levels produce four paths that cannot be flattened to a readable
  `if/else if/else` without restructuring; the host author must decide the shape.
- **Mixed supported/unsupported sub-expression** — if any sub-expression escalates, the
  entire outer expression escalates. The `expression_raw` is preserved verbatim.

---

## `expression_type` handoff to adapter resolution

`expression_type` is the primary input to the overload selection algorithm in
`adapter-resolution.md`. Without it, the algorithm cannot pick the correct `@BindingAdapter`
overload: overloads for the same attribute (e.g., `android:text` accepting `CharSequence`,
`Int` resource id, or `Spanned`) produce different replacement templates and different
runtime behavior. Expression resolution therefore runs first during Discovery — once per
`@{...}` occurrence across every layout in scope — before adapter resolution begins.

---

## Worked examples

**Example 1 — property chain.**
`android:text="@{viewModel.user.name}"`:
`viewModel` from `<variable type="com.example.UserViewModel"/>`, `.user: User` and
`.name: String` resolved via `ast-index symbol`. Result: `expression_class = property_chain`,
`expression_type = String`, `expression_fragment = viewModel.user.name`.

**Example 2 — null coalescing with resource ref.**
`android:hint="@{viewModel.placeholder ?? @string/default_hint}"`:
`viewModel.placeholder: String?` from `<variable>`, `@string/default_hint` resolves to
`String`. LUB is `String`. Result: `expression_class = null_coalescing`,
`expression_type = String`,
`expression_fragment = viewModel.placeholder ?: context.getString(R.string.default_hint)`.

**Example 3 — lambda listener.**
`android:onClick="@{(v) -> viewModel.onItemClick(item)}"`:
`viewModel` and `item: Item` from `<variable>`, `onItemClick(Item)` resolved via
`ast-index symbol`, return type `Unit`. Attribute `android:onClick` expects
`View.OnClickListener` (SAM), single-arg lambda matches. Result: `expression_class = lambda`,
`expression_type = View.OnClickListener`,
`expression_fragment = setOnClickListener { v -> viewModel.onItemClick(item) }`.
The `v` parameter is retained to match the SAM signature; host may simplify to `{ _ -> ... }`.

**Example 4 — safeUnbox.**
`app:badgeCount="@{safeUnbox(viewModel.unreadCount)}"`:
`viewModel.unreadCount: Int?` (nullable `Integer` from Java ViewModel). `safeUnbox(Int?)`
yields primitive `Int`. Result: `expression_class = safe_unbox`, `expression_type = Int`,
`expression_fragment = viewModel.unreadCount ?: 0`. The `?: 0` is mandatory — DataBinding's
`safeUnbox` guarantees a non-null `int`; omitting the fallback changes null behavior.

---

## Cross-references

- `adapter-resolution.md` — consumes `expression_type` and `expression_fragment` produced
  here; runs after expression resolution to select the `@BindingAdapter` overload and
  produce the final `replacement_fragment`.
- `property-map-spec.md` — defines the schema columns `expression_raw`, `expression_type`,
  and `expression_fragment` (this file writes these) plus `adapter_origin`,
  `adapter_symbol`, and `replacement_fragment` (written by adapter-resolution). The
  intermediates `expression_class` and `resolved_symbol` are internal to expression
  resolution and are not persisted in the map.
- `mechanical-transforms.md` — uses the final `replacement_fragment` to weave Kotlin code
  into the host file.
