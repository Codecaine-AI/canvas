# One email's life in a home email pipeline

We need a state chart of how one email moves through our home email pipeline, a service on a home server that sorts the household's Gmail. Every state and transition below is backed by a TLA+ model checked with TLC, so the chart must show exactly these states and the condition on each transition.

An email starts as received. When Gmail sends a notice, the service fetches the message and stores it; a duplicate delivery of a message id that is already stored changes nothing. From stored, the classifier first applies a built-in protected check, so a security alert, a payment failure, or an account problem can never be archived, and then the rules table, where the first matching rule wins. If no rule matches, a model picks one category. A rule match or a confident model choice makes the email classified. A failed classify call moves it to a classify retry, which ends classified when the model is sure, or low confidence when the model is not sure or the retries run out. A low-confidence email goes straight to bucketing in Needs Review.

A classified email whose category has an enricher (receipt, bill, package, or event) moves to enriching; one with no enricher goes straight to bucketing. Enriching ends enriched when the enricher writes its record, or enrich failed when it fails. Both outcomes continue to bucketing: an enricher failure never blocks bucketing.

Bucketing is one state, writing the Gmail label. When the label lands, the email comes to rest in exactly one bucket: Inbox, Needs Reply, Needs Review, Archive, or Digest. If the last label write fails, the email rests in Inbox. A Digest email becomes digested when the scheduled digest goes out. Separate the states where the service is working from the states where the email rests. From any bucket, a person can move the email to another category, which makes it corrected, and the service re-buckets it through the label write.

The diagram should make clear the one path from received to a resting bucket, the retry and low-confidence branches of classification, the enrichment branch that can fail without blocking, and the correction loop back into bucketing.
