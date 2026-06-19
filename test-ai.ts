import { analyzeIssueWithLLM } from './src/lib/ai';

async function main() {
  console.log('Testing AI categorization...');
  const text1 = "Professor Smith hasn't shown up for the Data Structures lecture in Room 402 and it's been 30 minutes.";
  const text2 = "There are a group of seniors harassing freshers behind the Academic Block right now, please send security anonymously.";
  
  try {
    const res1 = await analyzeIssueWithLLM(text1);
    console.log('Result 1:', res1);

    const res2 = await analyzeIssueWithLLM(text2);
    console.log('Result 2:', res2);
  } catch(e) {
    console.error(e);
  }
}

main();
