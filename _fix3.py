import pathlib, sys
root = pathlib.Path(r"F:\Codync\发版工\work\z15")
def edit(rel, pairs):
    p = root / rel
    t = p.read_text(encoding="utf-8")
    for old, new in pairs:
        if t.count(old) != 1:
            print("ANCHOR_FAIL", rel, repr(old[:70]), t.count(old)); sys.exit(1)
        t = t.replace(old, new)
    p.write_text(t, encoding="utf-8")
    print("ok", rel)

kt_old = '''/**
 * The Agent card's first line while the bot runs on a fallback; null on its own agent. [name] says what to call a login
 * ("Claude Code (Work)" on a login profile), the computer's own by its name too when asked, which tells two logins of one
 * agent apart; [clock] writes a time.
 */
fun Bot.stepBanner(name: (Login, own: Boolean) -> String, clock: (Long) -> String, now: Long = System.currentTimeMillis()): String? {
    val step = agentStep?.login ?: return null
    val same = step.backend == backend
    val (to, own) = name(step, same) to name(login, same)
    val rest = restOf(login, now)
    if (rest?.reason == "usageLimit") return "Using $to until $own resets at ${clock(rest.until)}"
    return "Using $to while $own ${rest?.phrase ?: "can't answer"}"
}'''
kt_new = '''/** A sentence before it is translated: the phrase, and the names to put in once it is read in the app's language. */
data class StepBanner(val key: String, val values: Map<String, String>)

/** Puts a translated phrase's names in: a login profile named "Work while traveling" stays one name. */
fun fillTemplate(phrase: String, values: Map<String, String>): String =
    Regex("\\\\{(\\\\w+)\\\\}").replace(phrase) { values[it.groupValues[1]] ?: it.value }

/**
 * The Agent card's first line before it is translated; null on its own agent. [name] says what to call a login
 * ("Claude Code (Work)" on a login profile), the computer's own by its name too when asked, which tells two logins of one
 * agent apart; [clock] writes a time.
 */
fun Bot.stepBannerPhrase(name: (Login, own: Boolean) -> String, clock: (Long) -> String, now: Long = System.currentTimeMillis()): StepBanner? {
    val step = agentStep?.login ?: return null
    val same = step.backend == backend
    val (to, own) = name(step, same) to name(login, same)
    val names = mapOf("to" to to, "own" to own)
    val rest = restOf(login, now) ?: return StepBanner("Using {to} while {own} can't answer", names)
    if (rest.reason == "usageLimit") return StepBanner("Using {to} until {own} resets at {time}", names + ("time" to clock(rest.until)))
    val phrase = rest.phrase ?: return StepBanner("Using {to} while {own} can't answer", names)
    return StepBanner("Using {to} while {own} $phrase", names)
}

/** The banner as one English line, for callers that show English; views translate the phrase first. */
fun Bot.stepBanner(name: (Login, own: Boolean) -> String, clock: (Long) -> String, now: Long = System.currentTimeMillis()): String? =
    stepBannerPhrase(name, clock, now)?.let { fillTemplate(it.key, it.values) }'''

edit(r"apps/android/core/src/main/kotlin/com/codync/android/core/Fallbacks.kt", [(kt_old, kt_new)])

sw_old = '''    /// The Agent card's first line while the bot runs on a fallback; nil on its own agent. `name` says what to call
    /// a login ("Claude Code (Work)" on a login profile); `own` asks for the computer's own login by its login profile too,
    /// which tells two logins of one agent apart.
    func stepBanner(now: Date = .now, name: (AgentLogin, _ own: Bool) -> String) -> String? {
        guard let step = stepLogin else { return nil }
        let same = step.backend == backend
        let to = name(step, same), own = name(login, same)
        let rest = rest(of: login, now: now)
        if let rest, rest.reason == "usageLimit" {
            return "Using \\(to) until \\(own) resets at \\(RelativeTime.clock(Date(milliseconds: rest.until)))"
        }
        return "Using \\(to) while \\(own) \\(rest?.phrase ?? "can't answer")"
    }'''
sw_new = '''    /// The Agent card's first line before it is translated; nil on its own agent. `name` says what to call
    /// a login ("Claude Code (Work)" on a login profile); `own` asks for the computer's own login by its login profile too,
    /// which tells two logins of one agent apart.
    func stepBannerPhrase(now: Date = .now, name: (AgentLogin, _ own: Bool) -> String) -> FallbackPhrase? {
        guard let step = stepLogin else { return nil }
        let same = step.backend == backend
        let to = name(step, same), own = name(login, same)
        let names = ["to": to, "own": own]
        guard let rest = rest(of: login, now: now) else {
            return FallbackPhrase(key: "Using {to} while {own} can't answer", values: names)
        }
        if rest.reason == "usageLimit" {
            return FallbackPhrase(
                key: "Using {to} until {own} resets at {time}",
                values: names.merging(["time": RelativeTime.clock(Date(milliseconds: rest.until))]) { _, new in new }
            )
        }
        guard let phrase = rest.phrase else {
            return FallbackPhrase(key: "Using {to} while {own} can't answer", values: names)
        }
        return FallbackPhrase(key: "Using {to} while {own} \\(phrase)", values: names)
    }

    /// The banner as one English line, for callers that show English; views translate the phrase first.
    func stepBanner(now: Date = .now, name: (AgentLogin, _ own: Bool) -> String) -> String? {
        stepBannerPhrase(now: now, name: name).map { L10n.fill($0.key, $0.values) }
    }'''

edit(r"apps/ios/Kit/Sources/CodyncKit/Models/AgentLogin.swift", [
    (sw_old, sw_new),
    ("public extension Backend {", "/** A sentence before it is translated: the phrase, and the names to put in once it is read in the app's language. */\npublic struct FallbackPhrase: Equatable {\n    public let key: String\n    public let values: [String: String]\n\n    public init(key: String, values: [String: String]) {\n        self.key = key\n        self.values = values\n    }\n}\n\npublic extension Backend {"),
])