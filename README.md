# Bitmap

An open sourced high-speed index. Based on [Roaring Bitmaps](https://roaringbitmap.org/) technology.

## Queries

* `*` &ndash; search all<br><br>
* `foo bar` &ndash; search `foo` and `bar` in `FULLTEXT` fields<br><br>
* `foo & bar` &ndash; same as above, but more explicit<br><br>
* `foo | bar` &ndash; search `foo` or `bar`<br><br>
* `@a:foo` &ndash; search `foo` for `a` field<br><br>
* `@a:(foo | bar)` &ndash; search `foo` or `bar` for `a` field<br><br>
* `-@a:foo` &ndash; search not `foo` for `a` field<br><br>
* `-@a:(foo | bar)` &ndash; search neither `foo` nor `bar` for `a` field<br><br>
* `@b:[1,10]` &ndash; search `b` from 1 to 10 (inclusively)<br><br>
* `-@b:[1,10]` &ndash; revert results from above query<br><br>
* `@b:[(1,10)]` &ndash; search `b` from 1 to 10 (exclusively)<br><br>
* `@b:[1,]` &ndash; search `b` from 1 to maximum available value<br><br>
* `@b:[1,MAX]` &ndash; same as above, but more semantic<br><br>
* `@b:[1]` &ndash; search `b` equal to 1<br><br>
* `@b:[,10]` &ndash; search `b` from minimum available value to 10<br><br>
* `@b:[MIN,MAX]` &ndash; search all where `b` is set (short form `[,]` is also valid)<br><br>
* `@b:[(,)]` &ndash; search all, but exclude minimum and maximum values<br><br>
* `-@b:[(,)]` &ndash; looks weird, but it's valid negation<br><br>
* `@b:([MIN] | [MAX])` &ndash; same as above<br><br>
* `@c:true` &ndash; search `true` for `c` (it's `BOOLEAN`)<br><br>
* `@c:1` &ndash; also valid syntax for `true`<br><br>
* `@d:[2010-01-01,2011-01-01)]` &ndash; search all dates for 2010<br><br>
