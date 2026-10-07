/**
 * Example requests for providers (src/lib/provider-example.ts), mirroring the server's rules so a bad example is caught before it
 * is sent.
 *
 *     node scripts/tests/provider-example.test.cjs
 */
const { makeLoader, reporter } = require("./_harness.cjs");
const { check, finish } = reporter();
const { exampleProblem, prettyExample, EXAMPLE_MAX } = makeLoader({})("src/lib/provider-example.ts");

check("empty or blank is fine (the example is optional)", exampleProblem("") === null && exampleProblem("   \n ") === null);
check("a JSON object is fine", exampleProblem('{"city":"Lagos"}') === null && exampleProblem('{\n  "city": "Lagos",\n  "days": 3\n}') === null && exampleProblem("{}") === null);
check("invalid JSON is explained", exampleProblem("{city: Lagos}") === "That isn’t valid JSON yet." && exampleProblem('{"a":') === "That isn’t valid JSON yet.");
check("arrays and bare values are refused (it must be an object)", /JSON object/.test(exampleProblem("[1,2]")) && /JSON object/.test(exampleProblem("42")) && /JSON object/.test(exampleProblem('"hi"')) && /JSON object/.test(exampleProblem("null")));
check("too long is refused, exactly at the limit is fine", /Too long/.test(exampleProblem(JSON.stringify({ a: "x".repeat(EXAMPLE_MAX) }))) && exampleProblem(JSON.stringify({ a: "x".repeat(EXAMPLE_MAX - 8) })) === null);
check("the limit matches the server's (1,500 characters)", EXAMPLE_MAX === 1500);

check("pretty: compact JSON is laid out for editing", prettyExample('{"city":"Lagos","days":3}') === '{\n  "city": "Lagos",\n  "days": 3\n}');
check("pretty: nothing gives an empty box", prettyExample(null) === "" && prettyExample(undefined) === "" && prettyExample("") === "");
check("pretty: text that isn't JSON is shown as it is (never lost)", prettyExample("not json") === "not json");

finish();
