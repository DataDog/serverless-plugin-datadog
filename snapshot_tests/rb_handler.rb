# frozen_string_literal: true

require 'datadog/lambda'

Datadog::Lambda.configure_apm do |c|
end

def hello(event:, context:)
  Datadog::Lambda.wrap(event, context) do
    body = {
      'message' => "Datadog <3 Serverless!",
      'input' => event
    }

    response = {
      'statusCode' => 200,
      'body' => body
    }

    response
  end
end
