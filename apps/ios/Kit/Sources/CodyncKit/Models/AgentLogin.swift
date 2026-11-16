import Foundation

/// A login of a bot's chain: an agent on one of its login profiles, or (no login profile) on the login the computer already has.
/// Two steps are the same when they run the same agent on the same login.
public struct AgentLogin: Hashable, Sendable {
    public var backend: String
    public var loginProfile: String?

    public init(backend: String, loginProfile: String? = nil) {
        self.backend = backend
        self.loginProfile = loginProfile
    }
}

public extension BotFallback {
    var login: AgentLogin { AgentLogin(backend: backend, loginProfile: loginProfile) }
}

public extension BotDraft {
    /// The bot's own login.
    var login: AgentLogin { AgentLogin(backend: backend, loginProfile: loginProfile) }
}

public extension AgentRest {
    var login: AgentLogin { AgentLogin(backend: agent, loginProfile: loginProfile) }
}

public extension Bot {
    /// The bot's own login.
    var login: AgentLogin { AgentLogin(backend: backend, loginProfile: loginProfile) }

    /// The step the bot runs on right now, as a login; nil on its own agent.
    var stepLogin: AgentLogin? { agentStep.map { AgentLogin(backend: $0.agent, loginProfile: $0.loginProfile) } }

    /// `login`'s rest while it lasts: one whose time has passed is over, whatever the host last said.
    func rest(of login: AgentLogin, now: Date = .now) -> AgentRest? {
        resting.first { $0.login == login && Date(milliseconds: $0.until) > now }
    }

    /// The Agent card's first line before it is translated; nil on its own agent. `name` says what to call
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
        return FallbackPhrase(key: "Using {to} while {own} \(phrase)", values: names)
    }

    /// The banner as one English line, for callers that show English; views translate the phrase first.
    func stepBanner(now: Date = .now, name: (AgentLogin, _ own: Bool) -> String) -> String? {
        stepBannerPhrase(now: now, name: name).map { L10n.fill($0.key, $0.values) }
    }
}

/** A sentence before it is translated: the phrase, and the names to put in once it is read in the app's language. */
public struct FallbackPhrase: Equatable {
    public let key: String
    public let values: [String: String]

    public init(key: String, values: [String: String]) {
        self.key = key
        self.values = values
    }
}

public extension Backend {
    /// The logins a new step can still take: the computer's own (nil, first) and the login profiles that are signed in,
    /// without the ones the chain has.
    func freeLogins(taken: [AgentLogin]) -> [String?] {
        let all: [String?] = [nil] + (loginProfiles ?? []).filter(\.signedIn).map(\.id)
        return all.filter { !taken.contains(AgentLogin(backend: id, loginProfile: $0)) }
    }
}
