# Who writes and reads each Session file

We need an ownership map of the files in one Session folder of our knowledge system, showing who writes each file and who reads it. A Session is one pass at a body of work, and its folder holds six kinds of file: session.json (the Session's fields, such as phase, approvals and threads), questions.json (questions for the owner and his answers), a slice.json in each Spec slice folder (the slice's target doc and the outcome of its copy), 20-plan/plan.json (checkpoints, task groups and tasks), 30-build/progress.json (task results, verdicts and acceptances), and the Log docs, one log/ folder per phase.

There are two writers. Any agent thread of the Session writes every one of these files through the server's tools: session_update and session_approve for session.json, question_add and question_answer for questions.json, slice_set for slice.json, plan_write for plan.json, progress_add for progress.json, and the docs tools for the Log docs. The app is the second writer and touches only two files: it writes session.json when the owner approves or pauses a Session, and it can write an answer into questions.json, a path that is not built yet.

One Session lock covers every write to session.json, plan.json, progress.json, questions.json and each slice.json, so two threads never write one file at the same moment. plan.json carries a revision, and a write with a stale base revision is refused. progress.json is append only.

There are three readers. The index parses every file in the folder and gives the app its page data. The resume brief reads every file so a new thread can pick up the work. The doc update pass reads each slice.json for the target doc it copies the slice into.

The diagram should make clear which writer owns which file, that the lock covers the shared folder, and which reader consumes which files, including the loop where the app both writes Session files and reads the index's page data.
