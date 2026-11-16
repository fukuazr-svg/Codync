import pathlib, sys
p = pathlib.Path(r"F:\Codync\发版工\work\z15\host\src\agent\bot\updates.rs")
t = p.read_text(encoding="utf-8")
pairs = [
 ("    pub(super) async fn answer_permission(&mut self, entry_id: &str, option_id: Option<String>) {\n        let Some(answer) = self.perms.remove(entry_id) else { return };\n        let mut status = if option_id.is_some() { \"answered\" } else { \"cancelled\" };",
  "    /// Answers the card; false when it was gone (or its tool stopped waiting), so a caller can say so.\n    pub(super) async fn answer_permission(&mut self, entry_id: &str, option_id: Option<String>) -> bool {\n        let Some(answer) = self.perms.remove(entry_id) else { return false };\n        let mut status = if option_id.is_some() { \"answered\" } else { \"cancelled\" };\n        let mut applied = true;"),
 ("                if reply.send(option_id.as_deref() == Some(\"allow\")).is_err() {\n                    status = \"expired\";\n                }",
  "                if reply.send(option_id.as_deref() == Some(\"allow\")).is_err() {\n                    status = \"expired\";\n                    applied = false;\n                }"),
 ("        if self.perms.is_empty() && self.asked.is_empty() && self.turn.is_some() {\n            self.hub.set_runtime(&self.cfg.id, |r| {\n                r.status = BotStatus::Working;\n                r.activity = \"Continuing…\".into();\n            });\n        }\n    }",
  "        if self.perms.is_empty() && self.asked.is_empty() && self.turn.is_some() {\n            self.hub.set_runtime(&self.cfg.id, |r| {\n                r.status = BotStatus::Working;\n                r.activity = \"Continuing…\".into();\n            });\n        }\n        applied\n    }"),
]
for old, new in pairs:
    if t.count(old) != 1:
        print("FAIL", t.count(old), repr(old[:60])); sys.exit(1)
    t = t.replace(old, new)
p.write_text(t, encoding="utf-8")
print("ok updates.rs")