---
schema_version: 2
---

## TASK-PLAN - Shape launch brief

```json
{"outcome":"Launch brief is decision-ready.","acceptance":["Stakeholders approve the brief."],"status":"planned","priority":"P1","owner":null,"critical":true,"success_criteria":["SC-OUTCOME"],"blocks":["TASK-DEPENDENT"],"milestone":"M-LAUNCH","scheduled_start":"2026-08-10","scheduled_end":"2026-08-12"}
```

Keep the launch promise sharp.

## TASK-DEPENDENT - Prepare launch assets

```json
{"outcome":"Launch assets are ready.","acceptance":["Every channel has an approved asset."],"status":"planned","priority":"P2","owner":"Nora","depends_on":["TASK-PLAN"],"milestone":"M-LAUNCH","scheduled_start":"2026-08-12","scheduled_end":"2026-08-15"}
```



## TASK-BLOCKED - Confirm legal language

```json
{"outcome":"Legal language is approved.","acceptance":["Counsel approves final copy."],"status":"planned","priority":"P0","owner":"Sam","blocked_by":["Waiting for counsel review"],"milestone":"M-LAUNCH","scheduled_start":"2026-08-13","scheduled_end":"2026-08-14"}
```



## TASK-READY - Book launch review

```json
{"outcome":"Launch review is scheduled.","acceptance":["Every decision owner accepts the invite."],"status":"ready","priority":"P1","owner":"Maya","milestone":"M-LAUNCH","scheduled_start":"2026-08-16","scheduled_end":"2026-08-16"}
```



## TASK-INPROGRESS - Build launch page

```json
{"outcome":"Launch page is implemented.","acceptance":["Page is available for review."],"status":"in_progress","priority":"P0","owner":"Ari","milestone":"M-LAUNCH","scheduled_start":"2026-08-17","scheduled_end":"2026-08-22","active_contract":"tc-d027b6d91dbd8a0c38d6f86e58069f1452a53c91c17d14336eef26a9ff68f077"}
```



## TASK-IMPLEMENTED - Instrument analytics

```json
{"outcome":"Launch analytics are implemented.","acceptance":["Events appear in the test stream."],"status":"implemented","priority":"P1","owner":"Kai","milestone":"M-LATER","scheduled_start":"2026-08-23","scheduled_end":"2026-08-25","active_contract":"tc-12e749ce3b32931aa155f85c4d4beeb750e7524ac38596846ed3cecf49f0bdcf","last_manifest":"em-c408e974aadfc6b69064378b73d120b67acc07908b5fabcff6bcfb3a6ed18f7a"}
```



## TASK-VERIFICATION - Verify accessibility

```json
{"outcome":"Accessibility checks are complete.","acceptance":["Critical paths pass the review."],"status":"verification","priority":"P1","owner":"Ivy","milestone":"M-LATER","scheduled_start":"2026-08-26","scheduled_end":"2026-08-27","active_contract":"tc-d4aa2796c3f81bd0c7b801d4aaf82a7d60bb29d3857d3027e8b171a152428e47","last_manifest":"em-2f44b1e4634e24991237ff18a389986c67413709bebeaecf3bda27cf161049c4"}
```



## TASK-VERIFIED - Approve release notes

```json
{"outcome":"Release notes are verified.","acceptance":["Product and support approve the notes."],"status":"verified","priority":"P2","owner":"Jo","milestone":"M-LATER","scheduled_start":"2026-08-28","scheduled_end":"2026-08-29","active_contract":"tc-ea612dc577df25395c2a7770920de233d5e40b95000bd30e80aa551b664cf870","last_manifest":"em-1a9fcbf4f940ae54ccb3abd3d23de793f791ff311f22ce814cb1950d0f47d72f"}
```



## TASK-DONE - Lock launch date

```json
{"outcome":"Launch date is confirmed.","acceptance":["All owners accept the date."],"status":"done","priority":"P2","owner":"Maya","milestone":"M-CLOSED","scheduled_start":"2026-08-30","scheduled_end":"2026-08-30","active_contract":"tc-99876dcc013dea67dd040d8744bbf760af6bff16fead5ee949e04c9d758041e5","last_manifest":"em-c96af92cbda5e846a8ebbd29cceed4a797d5f55659f688b9fdbb0b42186b58b7"}
```



## TASK-VAGUE - Do launch stuff

```json
{"outcome":"Make launch better.","acceptance":["Looks good."],"status":"planned","priority":"P3","owner":null}
```


