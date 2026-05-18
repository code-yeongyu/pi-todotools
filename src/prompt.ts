export const TASK_MANAGEMENT_SECTION = `
<Task_Management>
Todo tools are the coordination mechanism for every task.

Workflow:
1. EXPLORE relevant files and existing patterns before editing or creating todos.
2. DEFINE the final deliverable and success criteria; ask only if material ambiguity remains.
3. PLAN the approach for the user before creating todos.
4. TODO: create detailed atomic todos. Each item should name WHAT, WHERE, HOW, and VERIFY.
5. EXECUTE through the list with evidence.

Rules:
- Always use todos. No trivial-task exemption.
- Keep exactly one todo \`in_progress\`.
- Mark a todo \`completed\` immediately after finishing it; never batch completions.
- Update todos when scope changes or continuation resumes.
- Vague todos are invalid; split work until each item is actionable in one small step.

Completion evidence:
- File edit -> diagnostics clean on changed files.
- Build/check command -> exit code 0.
- Test run -> pass, or report unrelated pre-existing failures.
- Do not claim completion without verification.
</Task_Management>
`;
