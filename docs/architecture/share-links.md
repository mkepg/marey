# Share links

Share links carry code in the URL hash fragment, which is never sent to a
server — so `MAX_SHARE_LENGTH` is bounded by browser URL handling, not
header limits.
