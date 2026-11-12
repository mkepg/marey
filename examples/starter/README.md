# Marey starter

A new repository that checks and exports a Marey scene on every push.

1. Copy this folder's contents, including the hidden `.github/` directory, to
   the root of a new repository and push it. `cp -r examples/starter/. <repo>`
   copies it too; `cp examples/starter/* <repo>` leaves it behind.

   The workflow uses `mkepg/marey@main`. Until `marey-lang@0.7.0` is on npm,
   that fails at the install step with "marey-lang@0.7.0 is not published to
   npm yet". Pin a full commit SHA from after the publish instead of `main`.

2. Every push and pull request checks `hello.marey`. A mistake in the scene
   shows up as an error annotation on its line.

3. When the check passes, the run uploads a `marey-export` artifact. It holds
   `hello.png`, an APNG, and `hello.json`, a Lottie file.

4. Commit `hello.png` and embed it. It plays with no script on the page:

```text
<img src="hello.png" alt="A teal dot slides right while a bar grows under it">
```
