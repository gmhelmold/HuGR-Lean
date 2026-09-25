use std::env;
use std::io;
use std::process;

use hugr_lean::process_v1;
use hugr_lean::protocol::{read_observation_v1, write_result_v1, ProtocolError};

fn main() {
    if !is_filter_v1_invocation(env::args().skip(1)) {
        eprintln!("usage: hugr-lean filter --protocol 1");
        process::exit(2);
    }

    if let Err(error) = run_filter_v1() {
        eprintln!("hugr-lean protocol error: {error}");
        process::exit(2);
    }
}

fn is_filter_v1_invocation<I, S>(args: I) -> bool
where
    I: IntoIterator<Item = S>,
    S: AsRef<str>,
{
    let args: Vec<String> = args
        .into_iter()
        .map(|value| value.as_ref().to_owned())
        .collect();

    matches!(
        args.as_slice(),
        [command, flag, version]
            if command == "filter" && flag == "--protocol" && version == "1"
    )
}

fn run_filter_v1() -> Result<(), ProtocolError> {
    let stdin = io::stdin();
    let observation = read_observation_v1(stdin.lock())?;
    let result = process_v1(observation)?;

    let stdout = io::stdout();
    write_result_v1(stdout.lock(), &result)
}

#[cfg(test)]
mod tests {
    use super::is_filter_v1_invocation;

    #[test]
    fn accepts_only_filter_protocol_v1() {
        assert!(is_filter_v1_invocation(["filter", "--protocol", "1"]));
        assert!(!is_filter_v1_invocation(["filter", "--protocol", "2"]));
        assert!(!is_filter_v1_invocation(["filter"]));
        assert!(!is_filter_v1_invocation(["doctor"]));
        assert!(!is_filter_v1_invocation([
            "filter",
            "--protocol",
            "1",
            "extra"
        ]));
    }
}
