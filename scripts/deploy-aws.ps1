param(
  [ValidateSet('Prepare','Build','Deploy','Status','Configure')][string]$Phase='Status',
  [string]$Profile='signcast', [string]$Region='eu-west-1',
  [string]$Slug='signcast-01a19aeb',
  [string]$Repository='https://github.com/moses946/signcast.git',
  [string]$Revision='', [string]$PublicUrl='', [switch]$Live
)
$ErrorActionPreference='Stop'
Set-Location (Split-Path $PSScriptRoot -Parent)
if($Slug -notmatch '^signcast-[a-z0-9-]+$'){throw 'Use a unique signcast-* slug.'}
function Call-Aws([string[]]$Items){
  $raw=& aws @Items --profile $Profile --region $Region --output json --no-cli-pager
  if($LASTEXITCODE -ne 0){throw "AWS operation failed: $($Items[0]) $($Items[1])"}
  if($raw){return ($raw | ConvertFrom-Json)}
}
function Write-Input([string]$Name,$Value){$path="artifacts/$Name.json";$Value | ConvertTo-Json -Depth 30 | Set-Content -LiteralPath $path -Encoding utf8;return "file://$path"}
function Role([string]$Name,[string]$Service,[string]$SourceArn){
  $listed=Call-Aws @('iam','list-roles');$existing=$listed.Roles|Where-Object RoleName -eq $Name
  if($existing){$detail=Call-Aws @('iam','get-role','--role-name',$Name);if(-not($detail.Role.Tags|Where-Object {$_.Key -eq 'Project' -and $_.Value -eq 'SignCast'})){throw "Refusing unrelated existing role $Name"};return $existing.Arn}
  $trust=@{Version='2012-10-17';Statement=@(@{Effect='Allow';Principal=@{Service=$Service};Action='sts:AssumeRole';Condition=@{StringEquals=@{'aws:SourceAccount'=$script:Account};ArnLike=@{'aws:SourceArn'=$SourceArn}}})}
  $file=Write-Input "$Name-trust" $trust
  return (Call-Aws @('iam','create-role','--role-name',$Name,'--assume-role-policy-document',$file,'--tags','Key=Project,Value=SignCast')).Role.Arn
}
function Put-Policy([string]$RoleName,[string]$Name,$Statements){$file=Write-Input "$Name-policy" @{Version='2012-10-17';Statement=@($Statements)};[void](Call-Aws @('iam','put-role-policy','--role-name',$RoleName,'--policy-name',$Name,'--policy-document',$file))}
$identity=Call-Aws @('sts','get-caller-identity');$script:Account=$identity.Account
$stateFile='artifacts/aws-hosting.json'
if($Phase -eq 'Prepare'){
  & node scripts/prepare-aws.mjs;if($LASTEXITCODE -ne 0){throw 'Private configuration preparation failed.'}
  $vpcs=Call-Aws @('ec2','describe-vpcs','--filters','Name=is-default,Values=true');if(-not $vpcs.Vpcs.Count){throw 'A default VPC is required. No network was created.'}
  $all=Call-Aws @('ecr','describe-repositories');$repo=$all.repositories|Where-Object repositoryName -eq $Slug
  if(-not $repo){$repo=(Call-Aws @('ecr','create-repository','--repository-name',$Slug,'--image-tag-mutability','IMMUTABLE','--image-scanning-configuration','scanOnPush=true','--tags','Key=Project,Value=SignCast')).repository}
  $secretName="$Slug/runtime";$secrets=Call-Aws @('secretsmanager','list-secrets','--filters',"Key=name,Values=$secretName");$secret=$secrets.SecretList|Where-Object Name -eq $secretName
  if($secret){if(-not($secret.Tags|Where-Object {$_.Key -eq 'Project' -and $_.Value -eq 'SignCast'})){throw 'Refusing to replace an unrelated secret.'};[void](Call-Aws @('secretsmanager','put-secret-value','--secret-id',$secret.ARN,'--secret-string','file://artifacts/aws-runtime.private.json'))}
  else{$secret=Call-Aws @('secretsmanager','create-secret','--name',$secretName,'--secret-string','file://artifacts/aws-runtime.private.json','--tags','Key=Project,Value=SignCast')}
  $taskName="$Slug-task";$execName="$Slug-execution";$infraName="$Slug-infrastructure";$buildName="$Slug-build"
  $ecsSource="arn:aws:ecs:${Region}:${script:Account}:*"
  $taskArn=Role $taskName 'ecs-tasks.amazonaws.com' $ecsSource
  [void](Call-Aws @('iam','put-role-policy','--role-name',$taskName,'--policy-name','StreamingOnly','--policy-document','file://infra/transcribe-policy.json'))
  $executionArn=Role $execName 'ecs-tasks.amazonaws.com' $ecsSource
  [void](Call-Aws @('iam','attach-role-policy','--role-name',$execName,'--policy-arn','arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy'))
  Put-Policy $execName 'ReadSignCastRuntime' @(@{Effect='Allow';Action='secretsmanager:GetSecretValue';Resource=$secret.ARN})
  $infrastructureArn=Role $infraName 'ecs.amazonaws.com' $ecsSource
  [void](Call-Aws @('iam','attach-role-policy','--role-name',$infraName,'--policy-arn','arn:aws:iam::aws:policy/service-role/AmazonECSInfrastructureRoleforExpressGatewayServices'))
  $projectName="$Slug-image";$logGroup="/aws/codebuild/$projectName";$serviceLog="/signcast/$Slug"
  $groups=Call-Aws @('logs','describe-log-groups','--log-group-name-prefix','/');
  foreach($name in @($logGroup,$serviceLog)){if(-not($groups.logGroups|Where-Object logGroupName -eq $name)){[void](Call-Aws @('logs','create-log-group','--log-group-name',$name,'--tags','Project=SignCast'))};[void](Call-Aws @('logs','put-retention-policy','--log-group-name',$name,'--retention-in-days','7'))}
  $buildArn=Role $buildName 'codebuild.amazonaws.com' "arn:aws:codebuild:${Region}:${script:Account}:project/$projectName"
  Put-Policy $buildName 'BuildSignCastImage' @(@{Effect='Allow';Action='ecr:GetAuthorizationToken';Resource='*'},@{Effect='Allow';Action=@('ecr:BatchCheckLayerAvailability','ecr:InitiateLayerUpload','ecr:UploadLayerPart','ecr:CompleteLayerUpload','ecr:PutImage','ecr:BatchGetImage','ecr:GetDownloadUrlForLayer');Resource=$repo.repositoryArn},@{Effect='Allow';Action=@('logs:CreateLogStream','logs:PutLogEvents');Resource="arn:aws:logs:${Region}:${script:Account}:log-group:${logGroup}:*"})
  $project=@{name=$projectName;source=@{type='GITHUB';location=$Repository;gitCloneDepth=1;buildspec='infra/buildspec.yml'};artifacts=@{type='NO_ARTIFACTS'};environment=@{type='LINUX_CONTAINER';image='aws/codebuild/standard:7.0';computeType='BUILD_GENERAL1_SMALL';privilegedMode=$true;environmentVariables=@(@{name='REPOSITORY_URI';value=$repo.repositoryUri},@{name='IMAGE_TAG';value='initial'})};serviceRole=$buildArn;timeoutInMinutes=15;queuedTimeoutInMinutes=10;logsConfig=@{cloudWatchLogs=@{status='ENABLED';groupName=$logGroup;streamName='image'}};tags=@(@{key='Project';value='SignCast'})}
  $projects=Call-Aws @('codebuild','list-projects');$file=Write-Input 'codebuild-project' $project
  if($projects.projects -contains $projectName){[void](Call-Aws @('codebuild','update-project','--cli-input-json',$file))}else{[void](Call-Aws @('codebuild','create-project','--cli-input-json',$file))}
  $state=@{region=$Region;slug=$Slug;account=$script:Account;repositoryUri=$repo.repositoryUri;secretArn=$secret.ARN;taskRoleArn=$taskArn;executionRoleArn=$executionArn;infrastructureRoleArn=$infrastructureArn;projectName=$projectName;serviceLog=$serviceLog}
  $state|ConvertTo-Json -Depth 8|Set-Content $stateFile;Write-Output 'AWS foundation prepared. No credential values printed.';exit
}
if(-not(Test-Path $stateFile)){throw 'Run Prepare first.'};$state=Get-Content -Raw $stateFile|ConvertFrom-Json
if($state.account -ne $script:Account){throw 'Authenticated account does not match recorded deployment.'}
if($Phase -eq 'Build'){
  if(-not $Revision){$Revision=(& git rev-parse HEAD).Trim()};if($Revision -notmatch '^[a-f0-9]{40}$'){throw 'Use a full committed Git revision.'}
  $tag=$Revision.Substring(0,12);$file=Write-Input 'start-image-build' @{projectName=$state.projectName;sourceVersion=$Revision;environmentVariablesOverride=@(@{name='IMAGE_TAG';value=$tag;type='PLAINTEXT'})}
  $build=Call-Aws @('codebuild','start-build','--cli-input-json',$file);$state|Add-Member -Force NoteProperty buildId $build.build.id;$state|Add-Member -Force NoteProperty imageTag $tag;$state|ConvertTo-Json -Depth 10|Set-Content $stateFile;Write-Output "Image build started: $($build.build.id)";exit
}
if($Phase -eq 'Status'){
  if($state.buildId){$build=(Call-Aws @('codebuild','batch-get-builds','--ids',$state.buildId)).builds[0];Write-Output "Image build: $($build.buildStatus) / $($build.currentPhase)"}
  if($state.serviceArn){$service=Call-Aws @('ecs','describe-express-gateway-service','--service-arn',$state.serviceArn);$service|ConvertTo-Json -Depth 20|Set-Content artifacts/aws-service-status.json;Write-Output "Service: $($service.service.status.statusCode)";foreach($entry in $service.service.activeConfigurations){foreach($path in $entry.ingressPaths){Write-Output "Endpoint: $($path.endpoint)"}}};exit
}
if($Phase -eq 'Deploy'){
  $build=(Call-Aws @('codebuild','batch-get-builds','--ids',$state.buildId)).builds[0];if($build.buildStatus -ne 'SUCCEEDED'){throw 'Image build must succeed before deployment.'}
}
if($Phase -eq 'Configure' -and -not $PublicUrl){throw 'Supply the observed HTTPS endpoint with -PublicUrl.'}
$origin=if($PublicUrl){([uri]$PublicUrl).GetLeftPart([System.UriPartial]::Authority)}else{'https://pending.invalid'}
$public=Get-Content -Raw artifacts/aws-public-config.json|ConvertFrom-Json
$secretKeys=@('SIGNVRSE_API_KEY','SESSION_SECRET','OVERLAY_TOKEN_SECRET','VIEWER_SESSION_SECRET','TWITCH_CLIENT_ID','TWITCH_CLIENT_SECRET','TWITCH_EXTENSION_CLIENT_ID','TWITCH_EXTENSION_SECRET','TWITCH_EXTENSION_ALLOWED_ORIGINS')
$container=@{image="$($state.repositoryUri):$($state.imageTag)";containerPort=3000;awsLogsConfiguration=@{logGroup=$state.serviceLog;logStreamPrefix='app'};environment=@(@{name='NODE_ENV';value='production'},@{name='PORT';value='3000'},@{name='PUBLIC_BASE_URL';value=$origin},@{name='TWITCH_REDIRECT_URI';value="$origin/auth/twitch/callback"},@{name='AWS_REGION';value=$Region},@{name='SIGNVRSE_API_BASE_URL';value=$public.signvrseUrl},@{name='SIGNVRSE_TRANSPORT';value='websocket'},@{name='MOCK_PROVIDERS';value=$(if($Live){'false'}else{'true'})});secrets=@($secretKeys|ForEach-Object {@{name=$_;valueFrom="$($state.secretArn):${_}::"}})}
if($Phase -eq 'Deploy'){
  $file=Write-Input 'create-hosted-service' @{serviceName=$Slug;executionRoleArn=$state.executionRoleArn;infrastructureRoleArn=$state.infrastructureRoleArn;taskRoleArn=$state.taskRoleArn;healthCheckPath='/healthz';primaryContainer=$container;cpu='256';memory='1024';cpuArchitecture='X86_64';scalingTarget=@{minTaskCount=1;maxTaskCount=1};tags=@(@{key='Project';value='SignCast'})}
  $service=Call-Aws @('ecs','create-express-gateway-service','--cli-input-json',$file);$state|Add-Member -Force NoteProperty serviceArn $service.service.serviceArn;$state|ConvertTo-Json -Depth 10|Set-Content $stateFile;Write-Output "ECS service created: $($state.serviceArn)"
}else{
  & node scripts/prepare-aws.mjs;if($LASTEXITCODE -ne 0){throw 'Secret preparation failed.'}
  [void](Call-Aws @('secretsmanager','put-secret-value','--secret-id',$state.secretArn,'--secret-string','file://artifacts/aws-runtime.private.json'))
  $file=Write-Input 'configure-hosted-service' @{serviceArn=$state.serviceArn;primaryContainer=$container;healthCheckPath='/healthz';scalingTarget=@{minTaskCount=1;maxTaskCount=1}}
  [void](Call-Aws @('ecs','update-express-gateway-service','--cli-input-json',$file));$state|Add-Member -Force NoteProperty publicUrl $origin;$state|ConvertTo-Json -Depth 10|Set-Content $stateFile;Write-Output "Configuration update submitted for $origin"
}
