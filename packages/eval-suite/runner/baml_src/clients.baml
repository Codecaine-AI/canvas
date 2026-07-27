retry_policy Exponential {
  max_retries 2
  strategy {
    type exponential_backoff
    delay_ms 300
    multiplier 1.5
    max_delay_ms 10000
  }
}

client<llm> JudgeClient {
  provider "openai-generic"
  retry_policy Exponential
  options {
    base_url "http://127.0.0.1:2455/v1"
    api_key env.CODEX_LB_API_KEY
    model "gpt-5.6-sol"
    reasoning_effort "low"
    response_format {
      type "json_object"
    }
  }
}
