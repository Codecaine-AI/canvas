col 2|1
  section 1 text=top label="Top"
    grid 1x3 gap=32
      item 2 text=a type=process size=M
      item 3 text=b type=process size=M
      item 4 text=c type=process size=M
  section 5 text=bottom label="Bottom"
    group
      item 6 text=note type=sticky size=S at=W
      item 7 text=core type=process size=L at=C

align y: 2 7

arrows
  2 > 3
  3 > 4
  4 > 7
