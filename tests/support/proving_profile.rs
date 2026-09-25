use hugr_lean::command::{CommandRecognition, InvocationIdentity};
use hugr_lean::preservation::{
    ByteSpan, LeanWriter, PreservationContract, RenderedOutput, Signal, SignalId,
};
use hugr_lean::profile::{
    AnalysisBundle, Profile, ProfileAnalysis, ProfileContext, ProfileError, ProfileMatch,
    ProfileRequirements, RouteContext,
};

pub const PROVING_PROFILE_ID: &str = "proving-profile";
const PROOF_SIGNAL_ID: SignalId = SignalId::new("proof-signal");

pub struct ProvingProfile;

struct ProvingAnalysis {
    signal: Signal,
}

impl Profile for ProvingProfile {
    fn id(&self) -> &'static str {
        PROVING_PROFILE_ID
    }

    fn requirements(&self) -> ProfileRequirements {
        ProfileRequirements::COMPLETE_EXITED
    }

    fn recognize(&self, identity: &InvocationIdentity) -> ProfileMatch {
        match identity {
            InvocationIdentity::Shell(CommandRecognition::Direct(command))
                if command.program == "hugr-lean-prove" =>
            {
                ProfileMatch::Match
            }
            _ => ProfileMatch::NoMatch,
        }
    }

    fn shape_guard(&self, context: &RouteContext<'_>) -> ProfileMatch {
        if proof_span(&context.observation.output).is_some() {
            ProfileMatch::Match
        } else {
            ProfileMatch::NoMatch
        }
    }

    fn analyze(&self, context: &ProfileContext<'_>) -> Result<AnalysisBundle, ProfileError> {
        let span = proof_span(context.safe_baseline).ok_or_else(ProfileError::analyze)?;
        let signal = context
            .verbatim_signal(PROOF_SIGNAL_ID, span)
            .map_err(|_| ProfileError::analyze())?;

        Ok(AnalysisBundle::new(
            Box::new(ProvingAnalysis { signal }),
            PreservationContract::require(PROOF_SIGNAL_ID),
        ))
    }

    fn render(
        &self,
        analysis: &dyn ProfileAnalysis,
        writer: &mut LeanWriter,
    ) -> Result<(), ProfileError> {
        let analysis = analysis
            .as_any()
            .downcast_ref::<ProvingAnalysis>()
            .ok_or_else(ProfileError::render)?;

        writer.signal(&analysis.signal);
        writer.newline();
        Ok(())
    }

    fn validate(
        &self,
        analysis: &dyn ProfileAnalysis,
        rendered: &RenderedOutput,
    ) -> Result<(), ProfileError> {
        let analysis = analysis
            .as_any()
            .downcast_ref::<ProvingAnalysis>()
            .ok_or_else(ProfileError::validate)?;

        let expected = format!("{}\n", analysis.signal.canonical_text());
        if rendered.text() != expected || !rendered.emitted_signal_ids().contains(&PROOF_SIGNAL_ID)
        {
            return Err(ProfileError::validate());
        }

        Ok(())
    }
}

fn proof_span(input: &str) -> Option<ByteSpan> {
    let mut offset = 0;

    for line in input.split_inclusive('\n') {
        let content = line.strip_suffix('\n').unwrap_or(line);
        if content.starts_with("PROOF ") {
            return Some(ByteSpan::new(offset, offset + content.len()));
        }
        offset += line.len();
    }

    if offset < input.len() {
        let content = &input[offset..];
        if content.starts_with("PROOF ") {
            return Some(ByteSpan::new(offset, input.len()));
        }
    }

    None
}
