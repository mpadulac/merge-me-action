import { context, GitHub } from '@actions/github';

import { findPullRequestLastApprovedReview } from '../../graphql/queries';
import { ReviewEdges } from '../../types';
import { mutationSelector } from '../../utilities/graphql';
import { logError, logInfo, logWarning } from '../../utilities/log';

interface PullRequestInformation {
  reviewEdges: ReviewEdges;
}

interface Repository {
  repository: {
    pullRequest: {
      reviews: {
        edges: ReviewEdges;
      };
    };
  };
}

const getPullRequestInformation = async (
  octokit: GitHub,
  query: {
    pullRequestNumber: number;
    repositoryName: string;
    repositoryOwner: string;
  },
): Promise<PullRequestInformation | undefined> => {
  const response = await octokit.graphql(
    findPullRequestLastApprovedReview,
    query,
  );

  if (response === null) {
    return undefined;
  }

  const {
    repository: {
      pullRequest: {
        reviews: { edges: reviewEdges },
      },
    },
  } = response as Repository;

  return {
    reviewEdges,
  };
};

export const pullRequestHandle = async (
  octokit: GitHub,
  gitHubLogin: string,
): Promise<void> => {
  const { repository, pull_request: pullRequest } = context.payload;

  if (pullRequest === undefined || repository === undefined) {
    logWarning('Required pull request information is unavailable.');

    return;
  }

  if (pullRequest.user.login !== gitHubLogin) {
    logInfo(`Pull request not created by ${gitHubLogin}, skipping.`);

    return;
  }

  try {
    const pullRequestInformation = await getPullRequestInformation(octokit, {
      pullRequestNumber: pullRequest.number,
      repositoryName: repository.name,
      repositoryOwner: repository.owner.login,
    });

    if (pullRequestInformation === undefined) {
      logWarning('Unable to fetch pull request information.');
    } else {
      logInfo(
        `Found pull request information: ${JSON.stringify(
          pullRequestInformation,
        )}.`,
      );

      await octokit.graphql(
        mutationSelector(pullRequestInformation.reviewEdges[0]),
        {
          commitHeadline: pullRequest.title as string,
          pullRequestId: pullRequest.node_id as string,
        },
      );
    }
  } catch (error) {
    logError(error);
  }
};
