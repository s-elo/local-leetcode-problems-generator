const Request = require("request-promise-native");
const { GraphQLClient } = require("graphql-request");
const fs = require("fs-extra");
const path = require("path");

const fileExtMap = {
  javascript: "js",
};
const lang = "javascript";

// it might be expired
const { session, csrfToken } = JSON.parse(
  fs.readFileSync(path.resolve(__dirname, "cookies.json"), "utf-8")
);

const uri = {
  us: {
    base: "https://leetcode.com/",
    login: "https://leetcode.com/accounts/login/",
    graphql: "https://leetcode.com/graphql",
    problemsAll: "https://leetcode.com/api/problems/all/",
    algorithm: "https://leetcode.com/api/problems/algorithms/",
    problem: "https://leetcode.com/problems/$slug",
    submit: "https://leetcode.com/problems/$slug/submit/",
    submission: "https://leetcode.com/submissions/detail/$id/",
  },
  cn: {
    base: "https://leetcode-cn.com/",
    login: "https://leetcode-cn.com/accounts/login/",
    graphql: "https://leetcode-cn.com/graphql",
    problemsAll: "https://leetcode-cn.com/api/problems/all/",
    problem: "https://leetcode-cn.com/problems/$slug",
    submit: "https://leetcode-cn.com/problems/$slug/submit/",
    submission: "https://leetcode-cn.com/submissions/detail/$id/",
  },
};

const difficultyMap = ["easy", "medium", "hard"];

(async () => {
  //   only do the following without the folders
  if (!checkFolders(difficultyMap)) return;

  createFolders(difficultyMap);

  try {
    const problems = await getProblems("algorithm");

    console.log("generating...");
    for (const problem of problems) {
      await genTemplate(problem);
    }
  } catch (e) {
    console.log(e);
  }
})();

async function genTemplate(problem) {
  const { stat, status, difficulty, paid_only } = problem;

  if (paid_only) return;

  const code =
    status === "ac"
      ? await getSubmissionCode(stat.question__title_slug)
      : await getCodeSnippet(stat.question__title_slug);

  const template = `/*
  * @lc app=leetcode id=${stat.frontend_question_id} lang=${lang}
  *
  * [${stat.frontend_question_id}] ${stat.frontend_question_id}
  */
     
// @lc code=start
${code}
// @lc code=end`;

  const folder = difficultyMap[difficulty.level - 1];
  fs.writeFileSync(
    path.resolve(
      __dirname,
      `./${status === "ac" ? folder + "/" + "solved" : folder}/${
        stat.frontend_question_id
      }.${stat.question__title_slug.replace("-", "_")}.${fileExtMap[lang]}`
    ),
    template
  );
}

async function getSubmissions(questionSlug) {
  const submissions = [];
  let offet = 0;
  const limit = 20;
  let hasNext = true;
  while (hasNext) {
    // statusDisplay
    // lang
    // runtime
    // timestamp
    // url
    // isPending
    // memory
    const response = await GraphQLRequest({
      query: `
            query Submissions($offset: Int!, $limit: Int!, $questionSlug: String!) {
                submissionList(offset: $offset, limit: $limit, questionSlug: $questionSlug) {
                    lastKey
                    hasNext
                    submissions {
                        id
                    }
                }
            }
            `,
      variables: {
        offset: offet,
        limit: limit,
        questionSlug,
      },
    });

    const submissionList = response.submissionList.submissions;

    hasNext = response.submissionList.hasNext;
    offet += submissionList.length;

    submissions.push(...submissionList);
  }

  return submissions;
}

async function getSubmissionCode(questionSlug) {
  // get the id of the latest submission
  const [{ id }] = await getSubmissions(questionSlug);

  const response = await HttpRequest({
    url: uri.us.submission.replace("$id", id),
  });

  return JSON.parse(`"${response.match(/submissionCode:\s'([^']*)'/)[1]}"`);
}

async function getCodeSnippet(questionSlug) {
  const response = await GraphQLRequest({
    query: `
            query getQuestionDetail($titleSlug: String!) {
                question(titleSlug: $titleSlug) {
                    codeSnippets {
                        langSlug
                        code
                    }
                }
            }
        `,
    variables: {
      titleSlug: questionSlug,
    },
  });

  const codeSnippets = response.question.codeSnippets;

  if (!codeSnippets || codeSnippets.length === 0) return "";

  return codeSnippets.filter((c) => c.langSlug === lang).map((c) => c.code)[0];
}
async function getProblems(tag) {
  let response = await HttpRequest({
    url: uri.us[tag],
  });

  response = JSON.parse(response);

  return response.stat_status_pairs;
}

function checkFolders(difficultyMap) {
  for (const folder of difficultyMap) {
    if (fs.pathExistsSync(path.resolve(__dirname, folder))) {
      console.log(
        "you already have the folders, please manually delete them to create new ones"
      );

      return false;
    }
  }

  return true;
}

function createFolders(difficultyMap) {
  for (const folder of difficultyMap) {
    fs.mkdirSync(path.resolve(__dirname, folder));
    fs.mkdirSync(path.resolve(__dirname, `${folder}/solved`));
  }
}

async function HttpRequest(options) {
  return await Request({
    method: options.method || "GET",
    uri: options.url,
    followRedirect: false,
    headers: {
      Cookie: `LEETCODE_SESSION=${session};csrftoken=${csrfToken}`,
      "X-Requested-With": "XMLHttpRequest",
      "X-CSRFToken": csrfToken,
      Referer: options.referer || uri.us.base,
    },
    resolveWithFullResponse: options.resolveWithFullResponse || false,
    form: options.form || null,
    body: JSON.stringify(options.body) || "",
  });
}

async function GraphQLRequest(options) {
  const client = new GraphQLClient(uri.us.graphql, {
    headers: {
      Origin: options.origin || uri.us.base,
      Referer: options.referer || uri.us.base,
      Cookie: `LEETCODE_SESSION=${session};csrftoken=${csrfToken};`,
      "X-Requested-With": "XMLHttpRequest",
      "X-CSRFToken": csrfToken,
    },
  });
  return await client.request(options.query, options.variables || {});
}
