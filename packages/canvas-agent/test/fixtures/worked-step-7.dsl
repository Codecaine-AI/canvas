row 1|4|2
  section 1 text=config label="Config" hug=NW
    group
      item 2 text=checkout type=pill size=M at=N
      item 3 text=goals type=pill size=M at=C
      item 4 text=secrets type=pill size=M at=S
  col 2|1
    section 5 text=loop label="Runner loop"
      grid 1x4 gap=96
        item 6 text=cli type=process size=M
        item 7 text=sched type=process size=M
        item 8 text=workers type=process size=M
        item 9 text=match type=decision size=M
    section 10 text=board label="Board — hub"
      grid 2x2 gap=64
        item 11 text=epochs type=database size=M
        item 12 text=artifacts type=database size=M
        item 13 text=saves type=database size=M
        item 14 text=cache type=database size=M
  section 15 text=score label="Score gate"
    col 2|1
      grid 3x1 gap=64
        item 16 text=objdiff type=process size=M
        item 17 text=qa type=process size=M
        item 18 text=regress type=decision size=M
      group
        item 19 text=absorb type=pill size=S at=SW
        item 20 text=reject type=pill size=S at=SE

align y: 6 16
fan 18 dir=S: 19 20

arrows
  6 > 7
  7 > 8
  8 > 9
  9 > 16
  16 > 17
  17 > 18
  18 > 19
  18 > 20
  9 > 8
  13 > 16
