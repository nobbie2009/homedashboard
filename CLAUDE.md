# Repository workflow notes

## Pull requests

- **Always create a NEW pull request when the previous one for the same
  feature branch has already been merged.** Do not assume that pushing more
  commits to the same branch will reach `main` automatically — once a PR is
  merged it is closed, and follow-up commits on that branch need their own
  PR. Check `git log origin/main..<branch>` before deciding.
