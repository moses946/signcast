# AWS hosting: ECS Express Mode

The owner selected AWS hosting as well as Amazon Transcribe. Render remains an optional template.

## Topology

- CodeBuild builds a public Git commit; no local Docker daemon is required.
- ECR holds immutable image tags derived from commits.
- ECS Express Mode provides managed HTTPS/load balancing and one Fargate task.
- The application task role permits only Transcribe streaming in `eu-west-1`.
- A separate execution role pulls images, writes logs, and injects the single project Secrets Manager secret.
- No root credentials, local AWS profiles, `.env`, or developer passwords enter the image.
- Minimum/maximum task count is one; session/media state is in memory.
- Initial hosting is visibly **demo mode**. Live mode waits for the independent Twitch and Signvrse gates.

`scripts/deploy-aws.ps1` records metadata in ignored `artifacts/aws-hosting.json`. It refuses an unrelated existing named role. Bootstrap reads only the app credential allowlist from `.env` into ignored private input. Build workers cannot read the runtime secret.

## Reproduce

Use the intended provisioning account with IAM, Secrets Manager, ECR, CodeBuild, and ECS permissions, distinct from the application runtime identity.

```powershell
./scripts/deploy-aws.ps1 -Phase Prepare -Profile <provisioning-profile>
# Wait for Prepare to finish. New IAM roles may need propagation time.
./scripts/deploy-aws.ps1 -Phase Build -Profile <provisioning-profile>
./scripts/deploy-aws.ps1 -Phase Status -Profile <provisioning-profile>
# After the recorded image build succeeds:
./scripts/deploy-aws.ps1 -Phase Deploy -Profile <provisioning-profile>
./scripts/deploy-aws.ps1 -Phase Status -Profile <provisioning-profile>
# Use the endpoint actually returned by ECS:
./scripts/deploy-aws.ps1 -Phase Configure -Profile <provisioning-profile> -PublicUrl https://<observed-endpoint>
```

The default slug identifies this deployment. For another deployment pass a unique `-Slug signcast-<suffix>` and your public `-Repository` URL. Retain its manifest. Region defaults to `eu-west-1`, matching the streaming IAM policy; change both together when moving regions.

Push the full commit before Build. Private files are excluded by `.gitignore` and `.dockerignore`; image tags cannot be overwritten. The task initially boots with a placeholder origin for health checks; Configure replaces it with the observed HTTPS origin before browser use.

Register the hosted `/auth/twitch/callback` with Twitch and set the separate OAuth/extension credentials in `.env`. Configure with the observed URL and `-Live` only after live dependency and ASL checks pass. This rotates the project secret version and replaces the task; runtime sessions end. Package the Twitch extension locally with `VITE_API_BASE_URL` set to the observed backend origin.

## Verify and operate

Check HTTPS health, companion/demo label, owner controls, CSRF/Origin enforcement, WebSocket authentication, streamed media, two independent viewers, and OBS. ECS ACTIVE/HTTP health does not establish ASL accuracy or native Twitch approval.

AWS resources incur ongoing charges, including the load balancer; credit coverage is account-dependent. Inspect `Project=SignCast` resources. To stop hosting, delete only the recorded Express service through ECS, then review its project-specific images, logs, build project, secret, and roles. Do not delete the default VPC or unrelated/shared infrastructure. No automatic teardown is scheduled.
