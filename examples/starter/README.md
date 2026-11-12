# Marey starter

A new repository that checks and exports a Marey scene on every push.

1. Copy this folder's contents to the root of a new repository and push it.

2. Every push and pull request checks `hello.marey`. A mistake in the scene
   shows up as an error annotation on its line.

3. When the check passes, the run uploads a `marey-export` artifact. It holds
   `hello.png`, an APNG, and `hello.json`, a Lottie file.

4. Commit `hello.png` and embed it. It plays with no script on the page:

```text
<img src="hello.png" alt="A teal dot slides right while a bar grows under it">
```
