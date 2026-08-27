# The Declare Language

A reference for Declare, a declarative scene format that compiles to a PixiJS
scene graph. This document describes **behaviour**: what each construct does,
in what units, and what happens at its edges.

It is not a tutorial. Tutorials, guides and examples are Phase 5b, on the
documentation site.

Every example below is compiled by the test suite, so nothing here can silently
stop being true.

```declare
scene {
  size: (800, 600)
  background: #0a0e1a

  circle dot {
    position: (400, 300)
    radius: 40
    color: cyan
  }
}
```
