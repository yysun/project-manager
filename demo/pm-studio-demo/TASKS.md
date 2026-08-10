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
{"outcome":"Launch page is implemented.","acceptance":["Page is available for review."],"status":"in_progress","priority":"P0","owner":"Ari","milestone":"M-LAUNCH","scheduled_start":"2026-08-17","scheduled_end":"2026-08-22","active_contract":"tc-f3493b6acbf2340267cd4ce59a7b84740652d7ffded579831a23d66525b784ca"}
```



## TASK-IMPLEMENTED - Instrument analytics

```json
{"outcome":"Launch analytics are implemented.","acceptance":["Events appear in the test stream."],"status":"implemented","priority":"P1","owner":"Kai","milestone":"M-LATER","scheduled_start":"2026-08-23","scheduled_end":"2026-08-25","active_contract":"tc-2ad888075e26870894c76566e40216f4b2ed0e8dbb8e9024d71d3bc07a86672e","last_manifest":"em-f1e7775ef77a5b95c62c6a64876ce2f46aa85eb285367f9f2b276d18125f1ddf"}
```



## TASK-VERIFICATION - Verify accessibility

```json
{"outcome":"Accessibility checks are complete.","acceptance":["Critical paths pass the review."],"status":"verification","priority":"P1","owner":"Ivy","milestone":"M-LATER","scheduled_start":"2026-08-26","scheduled_end":"2026-08-27","active_contract":"tc-5c13f5f43b6216786508d44c3f432a7ce5afaddc890a22254b33a3c3a1b2b219","last_manifest":"em-063c7d0abb77b3f4294d3652080536967700e0d1f7e2f6d17c8ef071867b19c9"}
```



## TASK-VERIFIED - Approve release notes

```json
{"outcome":"Release notes are verified.","acceptance":["Product and support approve the notes."],"status":"verified","priority":"P2","owner":"Jo","milestone":"M-LATER","scheduled_start":"2026-08-28","scheduled_end":"2026-08-29","active_contract":"tc-63859927fbecb5ffaa0eacde6c490babf49ce6a57ef420613062f7374db62988","last_manifest":"em-b298bf6e9269d02adcc1e519a7cc7d0198c17d9d47fa2e3ca5d83627d7a70392"}
```



## TASK-DONE - Lock launch date

```json
{"outcome":"Launch date is confirmed.","acceptance":["All owners accept the date."],"status":"done","priority":"P2","owner":"Maya","milestone":"M-CLOSED","scheduled_start":"2026-08-30","scheduled_end":"2026-08-30","active_contract":"tc-86a0e33a4309be1fbb7a77961fae66d1b61c62a39c8908abb6b6eebd79a7a53f","last_manifest":"em-109f119451d8a32c9a474205998749a06da0e87eab2b645eccd85c439add4af0"}
```



## TASK-VAGUE - Do launch stuff

```json
{"outcome":"Make launch better.","acceptance":["Looks good."],"status":"planned","priority":"P3","owner":null}
```


