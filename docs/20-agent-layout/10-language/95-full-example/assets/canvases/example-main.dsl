col 2|1
  section 1 text=pipeline label="Pipeline"
    row 1|1|1
      item 2 text=ingest type=process size=M at=C
      item 3 text=parse type=process size=M at=C
      item 4 text=score-gate type=decision size=L at=C
  grid 3x2 gap=32
    item 5 text=check-a type=sticky size=M
    item 6 text=check-b type=sticky size=M
    item 7 text=check-c type=sticky size=M
    item 8 text=check-d type=sticky size=M
    item 9 text=check-e type=sticky size=M
    item 10 text=check-f type=sticky size=M

align y: 2 3 4
fan 4 dir=S: 5 6 7

arrows
  2 > 3
  3 > 4
  4 > 5
  4 > 6
  4 > 7
