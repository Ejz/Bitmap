# Bitmap

An open sourced high-speed index. Based on [Roaring Bitmaps](https://roaringbitmap.org/) technology.

## Try it

Clone and start:

```bash
$ git clone 'https://github.com/Ejz/Bitmap.git'
$ cd Bitmap
$ npm i
$ node etc/server.js & spid="$!"
```

Populate index with [airports.csv](https://ourairports.com/data/airports.csv). Then connect to server via client:

```bash
$ node etc/populate.js | grep -v OK
$ node etc/client.js
```

Let's check server statistics:

```
> stat
{
  "memory_rss": 226549760,
  "memory_rss_human": "227M",
  "memory_heap_total": 132669440,
  "memory_heap_total_human": "133M",
  "memory_heap_used": 78631192,
  "memory_heap_used_human": "79M",
  "memory_external": 244029,
  "memory_external_human": "244K"
}
```

`airports` statistics:

```
> stat airports
{
  "size": 56154,
  "id_minimum": 2,
  "id_maximum": 333948,
  "used_bitmaps": 299411,
  "used_bits": 2897604
}
```

Field `type` statistics:

```
> stat airports type
{
  "small_airport": 34361,
  "heliport": 11491,
  "medium_airport": 4541,
  "closed": 4101,
  "seaplane_base": 1021,
  "large_airport": 616,
  "balloonport": 23
}
```

Let's find all `balloonport` airports:

```
> search airports '@type:balloonport'
{
  "total": 23,
  "ids": [
    7767,
    ..
  ]
}
```

Now, all US airports with _Franklin_ in name:

```
> search airports '@iso_country:US franklin'
{
  "total": 25,
  "ids": [
    7350,
    ..
  ]
}
```

Finish:

```bash
> exit
$ kill "$spid"
```

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
* `@b >= 1 & @b <= 10` &ndash; for range queries can be used alternative syntax<br><br>
* `-@b:[1,10]` &ndash; revert results from above query<br><br>
* `@b:[(1,10)]` &ndash; search `b` from 1 to 10 (exclusively)<br><br>
* `@b:[1,]` &ndash; search `b` from 1 to maximum available value<br><br>
* `@b:[1,MAX]` &ndash; same as above, but more semantic<br><br>
* `@b:[1]` &ndash; search `b` equal to 1, or simply `@b:1`<br><br>
* `@b:[,10]` &ndash; search `b` from minimum available value to 10<br><br>
* `@b:[MIN,MAX]` &ndash; search all where `b` is set (short form `[,]` is also valid)<br><br>
* `@b:[(,)]` &ndash; search all, but exclude minimum and maximum values<br><br>
* `-@b:[(,)]` &ndash; looks weird, but it's valid negation<br><br>
* `@b:([MIN] | [MAX])` &ndash; same as above<br><br>
* `@b:(MIN | MAX)` &ndash; same as above<br><br>
* `@c:true` &ndash; search `true` for `c` (it's `BOOLEAN`)<br><br>
* `@c:1` &ndash; also valid syntax for `true`<br><br>
* `@d:[2010-01-01,2011-01-01)]` &ndash; search all dates for 2010<br><br>
* `@@e:(foo bar)` &ndash; refer to another index (linked via `FOREIGNKEY` field)<br><br>
