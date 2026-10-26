# Sonar diagnostics trust and analysis consistency

Both automatic and manual diagnostics validate the source run through the GitHub API before downloading `sonar-report-task`. The run must belong to the configured Regression Quality workflow, complete successfully from a push to `main`, and originate from this repository with both repository fork flags false. Manual run IDs are validated before being written to GitHub step outputs.

The export resolves the trusted host using the same repository configuration as the scan: `SONAR_HOST_URL` takes precedence, otherwise `SONAR_ORGANIZATION` selects SonarCloud. Artifact `serverUrl` must match that host exactly and `projectKey` must match `sonar-project.properties`. Artifact values never become request destinations; metadata is validated before authenticated Sonar requests, and redirects are rejected.

The quality gate is requested by the exact analysis ID returned by the artifact's CE task. Issue search only supports the current branch state. Therefore diagnostics require the current main analysis ID to match that exact ID both before and after exporting all issue pages and the gate. Stale or changed analyses fail without publishing diagnostics. These checks establish analysis consistency; issue status edits independent of an analysis are not an immutable historical snapshot.

The scan uploads only `.scannerwork/report-task.txt`, with hidden files explicitly enabled for portability. Diagnostics upload only after successful validated export.

Run the HTTP/artifact regression coverage with:

```sh
node --test tests/sonarDiagnosticsSecurity.test.js tests/sonarWorkflowContract.test.js
```

The tests use local HTTP endpoints and synthetic credentials to check trusted runs, rejection before token transmission, redirect handling, metadata injection, pagination, and analysis changes on either side of export.
