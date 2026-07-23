section 1 text=tree label="fan dir=S"
  group
    item 2 text=hub type=decision size=M at=N
    item 3 text=a type=process size=M at=SW
    item 4 text=b type=process size=M at=S
    item 5 text=c type=process size=M at=SE

fan 2 dir=S: 3 4 5

arrows
  2 > 3
  2 > 4
  2 > 5
