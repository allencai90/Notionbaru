import BLOG from '@/blog.config'
import NotionPage from '@/components/NotionPage'
import { getPostBlocks } from '@/lib/db/getSiteData'
import { Feed } from 'feed'
import fs from 'fs'
import path from 'path'
import ReactDOMServer from 'react-dom/server'

/**
 * 生成RSS内容
 * @param {*} post
 * @returns
 */
const createFeedContent = async (post) => {
  if (post.password && post.password !== '') {
    return post.summary
  }

  const blockMap = await getPostBlocks(post.id, 'rss-content')
  if (blockMap) {
    post.blockMap = blockMap
    const content = ReactDOMServer.renderToString(<NotionPage post={post} />)
    return content.replace(/<div class="notion-collection-row">.*?<\/div>/g, '')
  }
  return post.summary
}

/**
 * 生成RSS数据
 * @param {*} props
 */
export async function generateRss(props) {
  const { NOTION_CONFIG, siteInfo, latestPosts } = props
  const TITLE = siteInfo?.title
  const DESCRIPTION = siteInfo?.description
  const LINK = siteInfo?.link || BLOG.LINK
  const AUTHOR = NOTION_CONFIG?.AUTHOR || BLOG.AUTHOR
  const LANG = NOTION_CONFIG?.LANG || BLOG.LANG
  const SUB_PATH = NOTION_CONFIG?.SUB_PATH || BLOG.SUB_PATH
  const CONTACT_EMAIL = NOTION_CONFIG?.CONTACT_EMAIL || BLOG.CONTACT_EMAIL

  // 检查 feed 文件是否在 10 分钟内更新过
  const rssPath = path.resolve('./public/rss/feed.xml')
  if (isFeedRecentlyUpdated(rssPath, 10)) {
    return
  }

  console.log('[RSS订阅] 生成 /rss/feed.xml')
  const year = new Date().getFullYear()
  const feed = new Feed({
    title: TITLE,
    description: DESCRIPTION,
    link: `${LINK}/${SUB_PATH}`,
    language: LANG,
    favicon: `${LINK}/favicon.png`,
    copyright: `All rights reserved ${year}, ${AUTHOR}`,
    author: { name: AUTHOR, email: CONTACT_EMAIL, link: LINK }
  })

  const latestPostsLimited = latestPosts.slice(0, 10) // 仅保留最新10篇文章
  for (const post of latestPostsLimited) {
    feed.addItem({
      title: post.title,
      link: `${BLOG.LINK}/${post.slug}`,
      description: post.summary,
      content: await createFeedContent(post),
      date: new Date(post?.publishDay)
    })
  }

  try {
    fs.mkdirSync('./public/rss', { recursive: true })
    fs.writeFileSync(rssPath, feed.rss2())
    fs.writeFileSync(path.resolve('./public/rss/atom.xml'), feed.atom1())
    fs.writeFileSync(path.resolve('./public/rss/feed.json'), feed.json1())
  } catch (error) {
    console.warn('[RSS 生成失败] 可能运行在只读文件系统，已跳过写入')
  }
}

/**
 * 检查上次更新，如果 60 分钟内更新过就不操作。
 * @param {*} filePath
 * @param {*} intervalMinutes
 * @returns
 */
function isFeedRecentlyUpdated(filePath, intervalMinutes = 60) {
  try {
    const stats = fs.statSync(filePath)
    return (Date.now() - stats.mtimeMs) < intervalMinutes * 60 * 1000
  } catch (error) {
    return false
  }
}
