# Independent Amazon Transcribe setup

This project uses Amazon Transcribe Streaming, not Google Speech. The owner explicitly prohibited reusing Signvrse cloud credentials or services. Use the dedicated credentials authorized for SignCast only.

## Local authentication

AWS CLI 2.32 or newer supports `aws login`. Use the separate `signcast-developer` profile; sign in through the browser as the dedicated IAM identity. Prefer short-lived credentials. The application uses the AWS SDK v3 provider chain, never credentials embedded in source.

```powershell
aws login --profile signcast-developer --region eu-west-1
aws sts get-caller-identity --profile signcast-runtime --region eu-west-1
```

Use an application runtime role limited to `transcribe:StartStreamTranscription` in `eu-west-1`. `infra/transcribe-policy.json` follows the official HTTP/2 streaming setup policy, narrowed to that region. Account identity checks do not need explicit STS GetCallerIdentity permission. No S3 bucket, transcription job store, or dedicated server must be created for this live-streaming design.

The IAM Policy Autopilot was run on the adapter and a direct-call equivalent. It detected STS identity lookup but omitted the Transcribe Streaming operation. Do not deploy that incomplete generated result. The checked-in streaming policy instead matches [AWS’s documented HTTP/2 permission](https://docs.aws.amazon.com/transcribe/latest/dg/streaming-setting-up.html) and was validated with IAM Access Analyzer (no findings). The development role trusts only the dedicated `SignCastDeveloper` IAM user; the application assumes the limited role rather than using root permissions. AWS does not allow root identities to assume roles. No permanent access keys are created. The developer user can sign in locally, change its own password, and assume only this runtime role.

The runtime role/profile, if provisioned by the implementation agent, is recorded in the local ignored `artifacts/aws-provisioning.json`. Set `AWS_PROFILE=signcast-runtime` in `.env` after that profile is configured. A login profile is for development, not an unattended production credential mechanism.

For a fresh independent account, have its administrator create an equivalent limited role and permitted developer identity, then configure the role profile with your actual role ARN:

```powershell
aws configure set role_arn arn:aws:iam::<your-account>:role/SignCastTranscribeRuntime --profile signcast-runtime
aws configure set source_profile signcast-developer --profile signcast-runtime
aws configure set region eu-west-1 --profile signcast-runtime
```

## Production

Prefer a workload IAM role on AWS compute for unattended hosting. A Render server cannot use the developer’s local AWS login cache. Do not upload the entire `.aws` folder or root credentials. If Render is retained for the demo, explicitly configure appropriately scoped server credentials and their expiration/refresh process before deployment. Hosting on AWS instead is an infrastructure decision to make before paid resources are created.

## Streaming protocol

16 kHz mono signed PCM16 little-endian frames, approximately 100 ms each, pass from the companion to the backend. `StartStreamTranscription` uses `en-US`, PCM, and medium partial-result stabilization. Interim results are display-only; final results trigger signing. A single session lasts at most one hour. Google’s five-minute stream rotation is no longer relevant after the provider change.

Audio queue capacity is one second. If a connection fails or falls behind, capture stops with a gap indicator; resume explicitly. Do not resend old audio at accelerated speed or retry indefinitely on authentication errors. No recordings are written to disk.

AWS credits and free-tier coverage depend on the account’s terms; they are not verified by this application. Live test requests may incur streaming charges.

References: [Streaming input requirements](https://docs.aws.amazon.com/transcribe/latest/dg/streaming.html), [Transcribe IAM](https://docs.aws.amazon.com/transcribe/latest/dg/security_iam_id-based-policy-examples.html).
