# Refactoring legacy modules

The refactor is **gradual**, module by module, never a big bang. When
migrating an old module to this pattern: mark the `README` as `in-refactor`,
cover it with tests before moving code, and migrate by layers (extract
domain → define ports → move infra into adapters). Don't change the module's
external behavior during the refactor without checking with me first.
