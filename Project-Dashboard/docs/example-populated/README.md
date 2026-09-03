# Example: the register once it is populated

**Everything here is synthetic.** Job numbers 9xxx, invented site names, placeholder
clients and owners. It exists so the shape of a populated register and dashboard is
visible without putting any real project data in this repository.

Produced by running the generator against a synthetic folder tree with:

```bash
python3 tools/build_register.py --banner "EXAMPLE ONLY — synthetic demonstration data"
```

The `--banner` flag stamps that warning across both outputs. Use it on any demo or
training copy so it can never be mistaken for the live register.

The live register is generated **in Dropbox, from Dropbox**, and is never committed here.
